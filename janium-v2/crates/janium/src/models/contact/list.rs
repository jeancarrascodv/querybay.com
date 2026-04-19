use crate::prelude::*;

#[derive(Debug, Clone, ormlite::Model)]
#[ormlite(table = "contact_list")]
pub struct ContactList {
  #[ormlite(primary_key)]
  pub id: Id<ContactList>,
  team_id: Id<Team>,
  pub name: String,
  pub linkedin_id: Option<Id<LinkedIn>>,
  sales_nav_query: Option<String>,
  compressed_csv: Option<Vec<u8>>,
  created_date: Timestamp,
}

#[derive(Debug, sqlx::FromRow)]
pub struct ContactForList {
  #[allow(unused)]
  pub contact_list_id: Id<ContactList>,
  #[allow(unused)]
  pub contact_id: Id<Contact>,
}

impl ContactForList {
  pub async fn create(
    contact_list_id: Id<ContactList>,
    contact_id: Id<Contact>,
    db: &mut sqlx::PgConnection,
  ) -> Result<Self> {
    sqlx::query(
      "INSERT INTO contact_list_contact (contact_list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    )
    .bind(contact_list_id)
    .bind(contact_id)
    .execute(db)
    .await?;
    Ok(Self {
      contact_list_id,
      contact_id,
    })
  }
  #[expect(dead_code)]
  pub async fn delete(self, db: &mut sqlx::PgConnection) -> Result<()> {
    let rows_affected = sqlx::query("DELETE FROM contact_list_contact WHERE contact_list_id = $1 AND contact_id = $2")
      .bind(self.contact_list_id)
      .bind(self.contact_id)
      .execute(db)
      .await?
      .rows_affected();
    if rows_affected != 1 {
      return Err(JaniumError::msg(format!(
        "ContactForList {{contact_list_id: {}, contact_id: {}}} not found",
        self.contact_list_id, self.contact_id
      )));
    }
    Ok(())
  }
  pub async fn load_contact_ids(
    contact_list_id: Id<ContactList>,
    db: &mut sqlx::PgConnection,
  ) -> Result<Vec<Id<Contact>>> {
    sqlx::query_scalar::<_, Id<Contact>>("SELECT contact_id FROM contact_list_contact WHERE contact_list_id = $1")
      .bind(contact_list_id)
      .fetch_all(db)
      .await
      .map_err(|e| e.into())
  }
}

impl ContactList {
  pub fn new(
    team_id: Id<Team>,
    name: String,
    linkedin_id: Option<Id<LinkedIn>>,
    sales_nav_query: Option<String>,
    compressed_csv: Option<Vec<u8>>,
  ) -> Self {
    Self {
      id: Id::new(),
      team_id,
      name,
      linkedin_id,
      created_date: Timestamp::now(),
      sales_nav_query,
      compressed_csv,
    }
  }
  pub async fn new_from_reader(
    app_state: &AppState,
    sender: &Sender<Team>,
    list_name: String,
    file: impl std::io::Read,
  ) -> Result<ContactListResult> {
    static SINGLE_LIST_MODIFICATION: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
    let _single_list_modification = SINGLE_LIST_MODIFICATION.lock().await;
    let compressed = crate::util::compress(file)?;

    let mut contacts = Vec::<super::Contact>::with_capacity(1024);
    let mut companies = Vec::<Company>::with_capacity(256);
    let mut rejected_contacts = Vec::new();

    let mut csv_string = String::with_capacity(compressed.len() * 3);
    std::io::Read::read_to_string(&mut crate::util::decompress_reader(&compressed)?, &mut csv_string)?;
    let header = csv_string.lines().next().unwrap_or("");
    let cleaned = super::ContactCsv::replace_aliases(header);
    let csv_string = csv_string.replace(header, &cleaned);
    // drop the rdr when this is done so we can move compressed.
    {
      let mut rdr = ::csv::Reader::from_reader(std::io::Cursor::new(csv_string.as_str()));
      for result in rdr.deserialize::<super::ContactCsv>() {
        let record = result.map_err(crate::JaniumError::any)?;
        tracing::trace!(?record);
        record.validate()?;

        // into_contact does db queries, so we need to serialize before this point
        match record.clone().into_contact(app_state).await {
          Ok(Ok((contact, company))) => {
            if let Some(company) = company {
              companies.push(company);
            }
            contacts.push(contact);
          }
          Ok(Err(rejected_contact)) => {
            rejected_contacts.push(rejected_contact);
          }
          Err(e) => {
            return Err(e);
          }
        }
      }
    }

    // need to deduplicate companies here because the checks on the db don't prevent duplicates in a single csv.
    companies.sort_by(|l, r| l.li_profile_url.cmp(&r.li_profile_url));
    let mut current_duplicate_id = None;
    let mut duplicates = std::collections::HashMap::new();
    for c in companies.windows(2) {
      let (l, r) = match c {
        [l, r] => (l, r),
        _ => unreachable!(),
      };
      if l.li_profile_url == r.li_profile_url {
        current_duplicate_id = Some(current_duplicate_id.unwrap_or(l.id));
        duplicates.insert(r.id, current_duplicate_id.unwrap());
      } else {
        current_duplicate_id = None;
      }
    }
    companies.retain(|c| !duplicates.contains_key(&c.id));
    for contact in &mut contacts {
      if let Some(company_id) = &mut contact.inner.company_id
        && let Some(new_company_id) = duplicates.get(company_id)
      {
        *company_id = *new_company_id;
      }
    }

    let team_id = sender.id();

    let contact_list = Self::new(*team_id, list_name, None, None, Some(compressed));

    let mut transaction = app_state.db.begin().await?;
    sqlx::query("SET CONSTRAINTS ALL DEFERRED")
      .execute(&mut *transaction)
      .await?;

    for company in &companies {
      app_state
        .company_service
        .save(company.clone(), Some(&mut transaction))
        .await?;
    }

    // save after contacts have been created to satisfy fk constraints
    let contact_list_clone = contact_list.clone();
    let () = sender
      .send(async move |_: &mut Team, _router: &Router, state: &mut TeamState| {
        state.append_contact_list(contact_list_clone, None).await
      })
      .await??;
    for contact in &contacts {
      app_state
        .contact_service
        .save(Default::default(), contact.clone(), &mut transaction)
        .await?;
      ContactForList::create(contact_list.id, contact.inner.id, &mut transaction).await?;
    }

    // Only commit after successfully sending to the team
    transaction.commit().await?;

    let r = ContactListResult {
      contact_list,
      contacts,
      companies,
      rejected_contacts,
    };
    Ok(r)
  }
  pub async fn save(self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    let this = self
      .insert(&mut *transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        ContactList::primary_key().unwrap(),
      ))
      .await
      .inspect_err(|error| tracing::error!(%error, ?error, "unable to save contact_list"))?;
    Ok(this)
  }
  pub async fn delete(self, transaction: &mut sqlx::PgConnection) -> Result<()> {
    sqlx::query("DELETE FROM contact_list_contact WHERE contact_list_id = $1")
      .bind(self.id)
      .execute(&mut *transaction)
      .await?;
    sqlx::query("DELETE FROM contact_list WHERE id = $1")
      .bind(self.id)
      .execute(&mut *transaction)
      .await?;
    Ok(())
  }
  pub async fn load_by_team(team_id: Id<Team>, db: &sqlx::PgPool) -> Result<Vec<Self>> {
    let mut lists = Self::select().where_bind("team_id = ?", team_id).fetch_all(db).await?;
    lists.sort_unstable_by_key(|cl| cl.id);
    Ok(lists)
  }
}

#[derive(Debug, gql::SimpleObject)]
pub struct RejectedContact {
  pub contact_row: super::csv::ContactCsv,
  pub matched_ids: Vec<Id<Contact>>,
  pub message: String,
}

#[derive(Debug, gql::SimpleObject)]
pub struct ContactListResult {
  contact_list: ContactList,
  contacts: Vec<Contact>,
  companies: Vec<Company>,
  rejected_contacts: Vec<RejectedContact>,
}

#[gql::Object]
impl ContactList {
  pub async fn team_id(&self) -> Id<Team> {
    self.team_id
  }
  pub async fn id(&self) -> Id<Self> {
    self.id
  }
  pub async fn name(&self) -> &str {
    &self.name
  }
  pub async fn linkedin_id(&self) -> Option<Id<LinkedIn>> {
    self.linkedin_id
  }
  pub async fn sales_nav_query(&self) -> Option<&str> {
    self.sales_nav_query.as_deref()
  }
  pub async fn csv(&self) -> gql::Result<Option<String>> {
    let Some(bytes) = self.compressed_csv.as_deref() else {
      return Ok(None);
    };
    let decompressed = crate::util::decompress(bytes)?;
    Ok(Some(String::from_utf8(decompressed)?))
  }
  pub async fn contact_ids(&self, ctx: &gql::Context<'_>) -> Result<Vec<Id<Contact>>> {
    let state = ctx.data_unchecked::<AppState>();
    let mut conn = state.db.acquire().await?;
    ContactForList::load_contact_ids(self.id, &mut conn).await
  }
  pub async fn contacts(&self, ctx: &gql::Context<'_>) -> gql::Result<Vec<Arc<Contact>>> {
    let app_state = ctx.data_unchecked::<AppState>();
    let ids = self.contact_ids(ctx).await?;
    // TODO: determine what to do with missing contacts
    let found = app_state
      .contact_service
      .get_all(ids)
      .await
      .inspect_err(|error| tracing::error!(?error, "Unable to get contacts"))?;
    Ok(found)
  }
  pub async fn created_date(&self) -> Timestamp {
    self.created_date
  }
}
