use crate::prelude::*;
use crate::templates::scalar;

pub struct CompanyService {
  cache: quick_cache::sync::Cache<Id<Company>, Company>,
  li_url_map: dashmap::DashMap<String, Id<Company>>,
  db: sqlx::PgPool,
}

impl CompanyService {
  pub async fn new(limit: usize, db: sqlx::PgPool) -> Result<Self> {
    let cache = quick_cache::sync::Cache::new(limit);
    let li_url_map = Company::select()
      .fetch_all(&db)
      .await?
      .into_iter()
      .map(|c| {
        let t = (c.li_profile_url.clone(), c.id);
        cache.insert(c.id, c);
        t
      })
      .collect::<dashmap::DashMap<_, _>>();
    Ok(Self { cache, li_url_map, db })
  }
  pub fn try_get(&self, id: Id<Company>) -> Option<Company> {
    self.cache.get(&id)
  }
  pub async fn get(&self, id: Id<Company>) -> Result<Option<Company>> {
    let result = self
      .cache
      .get_or_insert_async(&id, async {
        Company::load(id, &self.db).await.and_then(|c| {
          if let Some(c) = c {
            self.li_url_map.insert(c.li_profile_url.clone(), c.id);
            Ok(c)
          } else {
            Err(JaniumError::not_found(id))
          }
        })
      })
      .await;
    match result {
      Ok(c) => Ok(Some(c)),
      Err(e) => {
        if e.is_not_found() {
          Ok(None)
        } else {
          Err(e)
        }
      }
    }
  }
  pub async fn get_by_li_url(&self, li_profile_url: &str) -> Result<Option<Company>> {
    if let Some(id) = self.li_url_map.get(li_profile_url) {
      return self.get(*id).await;
    }
    let id = sqlx::query_as::<_, (Id<Company>,)>("select id from company where li_profile_url = $1")
      .bind(li_profile_url)
      .fetch_optional(&self.db)
      .await?;
    if let Some((id,)) = id {
      self.get(id).await
    } else {
      Ok(None)
    }
  }

  pub async fn save(&self, company: Company, transaction: Option<&mut sqlx::PgConnection>) -> Result<()> {
    let insert = async move |transaction| {
      let company = company.save(transaction).await?;
      self.li_url_map.insert(company.li_profile_url.clone(), company.id);
      self.cache.insert(company.id, company);
      Ok(())
    };
    if let Some(transaction) = transaction {
      insert(transaction).await
    } else {
      let mut conn = self.db.acquire().await?;
      insert(&mut *conn).await?;
      Ok(())
    }
  }
}

#[derive(Debug, Clone, Default, ormlite::Model, gql::SimpleObject, gql::InputObject)]
#[graphql(input_name = "CompanyInput")]
pub struct Company {
  pub id: Id<Company>,
  pub li_profile_url: String,
  pub name: Option<String>,
  pub website: Option<String>,
  pub city: Option<String>,
  pub state: Option<String>,
  pub state_abbr: Option<String>,
  pub country_full: Option<String>,
  pub country_2: Option<String>,
  pub country_3: Option<String>,
  pub location: Option<String>,
  pub phone_1: Option<String>,
  pub phone_2: Option<String>,
  pub phone_3: Option<String>,
  pub annual_revenue: Option<i64>,
  pub website_domain: Option<String>,
  pub founded_year: Option<i16>,
  pub industry: Option<String>,
  pub revenue_range: Option<String>,
  pub staff_count: Option<i32>,
  pub staff_count_range: Option<String>,
}

impl Company {
  pub async fn save(self, transaction: &mut sqlx::PgConnection) -> Result<Self> {
    self
      .insert(transaction)
      .on_conflict(ormlite::query_builder::OnConflict::do_update_on_pkey(
        Company::primary_key().unwrap(),
      ))
      .await
      .inspect_err(|error| tracing::error!(?error, %error, "Unable to update company"))
      .map_err(Into::into)
  }
  pub async fn load(id: Id<Company>, db: &sqlx::PgPool) -> Result<Option<Self>> {
    Company::select()
      .where_bind("id = ?", id)
      .fetch_optional(db)
      .await
      .map_err(Into::into)
  }
  pub async fn template_data(self, map: &mut impl FnMut(&'static str, liquid::model::Value)) -> Result<()> {
    map("company_li_profile_url", scalar(self.li_profile_url));
    if let Some(name) = self.name {
      map("company_name", scalar(name));
    }
    if let Some(website) = self.website {
      map("company_website", scalar(website));
    }
    if let Some(city) = self.city {
      map("company_city", scalar(city));
    }
    if let Some(state) = self.state {
      map("company_state", scalar(state));
    }
    if let Some(state_abbr) = self.state_abbr {
      map("company_state_abbr", scalar(state_abbr));
    }
    if let Some(country_full) = self.country_full {
      map("company_country_full", scalar(country_full));
    }
    if let Some(country_2) = self.country_2 {
      map("company_country_2", scalar(country_2));
    }
    if let Some(country_3) = self.country_3 {
      map("company_country_3", scalar(country_3));
    }
    if let Some(location) = self.location {
      map("company_location", scalar(location));
    }
    if let Some(phone_1) = self.phone_1 {
      map("company_phone_1", scalar(phone_1));
    }
    if let Some(phone_2) = self.phone_2 {
      map("company_phone_2", scalar(phone_2));
    }
    if let Some(phone_3) = self.phone_3 {
      map("company_phone_3", scalar(phone_3));
    }
    if let Some(annual_revenue) = self.annual_revenue {
      map("company_annual_revenue", scalar(annual_revenue));
    }
    if let Some(website_domain) = self.website_domain {
      map("company_website_domain", scalar(website_domain));
    }
    if let Some(founded_year) = self.founded_year {
      map("company_founded_year", scalar(founded_year));
    }
    if let Some(industry) = self.industry {
      map("company_industry", scalar(industry));
    }
    if let Some(revenue_range) = self.revenue_range {
      map("company_revenue_range", scalar(revenue_range));
    }
    if let Some(staff_count) = self.staff_count {
      map("company_staff_count", scalar(staff_count));
    }
    if let Some(staff_count_range) = self.staff_count_range {
      map("company_staff_count_range", scalar(staff_count_range));
    }
    Ok(())
  }
}
