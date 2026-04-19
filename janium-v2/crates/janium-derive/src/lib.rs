use proc_macro2::{Ident, Span, TokenStream};
use quote::{ToTokens, quote};
use syn::{Data, DeriveInput, Field, FieldMutability, Path, Visibility, spanned::Spanned, token::Pub};

#[proc_macro_derive(Filterable, attributes(filterable, actor_id, data_handler, msg, custom_sea_orm))]
pub fn filter(input: proc_macro::TokenStream) -> proc_macro::TokenStream {
  let ast: DeriveInput = syn::parse(input).unwrap();

  let name = &ast.ident;

  //println!("processing {}", name);

  let mut db_table_name = "no_table_defined".to_string();

  //move all this for each to a function

  let mut sea_orm_model_obj = format!("crate::actors::{name}Model").replace("\"", "");

  let mut sea_orm_entity_obj = format!("crate::actors::{name}Entity").replace("\"", "");

  let mut update_msg_middlewares: Vec<TokenStream> = vec![];
  let mut create_msg_middlewares: Vec<TokenStream> = vec![];
  let mut update_msg_after_middlewares: Vec<TokenStream> = vec![];
  let mut create_msg_after_middlewares: Vec<TokenStream> = vec![];

  ast.attrs.into_iter().for_each(|at| {
    if let syn::Meta::List(value) = at.meta {
      let header = value.path.get_ident().unwrap().to_string();

      match header.as_str() {
        "data_handler" => {
          let mut val_iter = value.tokens.into_iter();
          let key = val_iter.next().unwrap().to_string();

          let has_equal_sign = val_iter.next().unwrap().to_string() == "=";
          let data = val_iter.next().unwrap().to_string();

          if key.len() < 2 || !has_equal_sign || data.len() < 2 {
            unimplemented!("should throw a macro error");
          }

          if key == "db_table_name" {
            db_table_name = data.clone();
          }

          //println!("{} -> {} = {}", header, key, data);
        }
        "msg" => {
          //println!("value tokens {:?}", value.tokens);
          let mut val_iter = value.tokens.into_iter();

          // for tok in val_iter.clone() {
          //   //println!("{:?}", tok);
          // }

          let key = val_iter.next().unwrap().to_string();

          if key.as_str() == "update_middleware" {
            //println!("{}", key);
            let group = if let proc_macro2::TokenTree::Group(group) = val_iter.next().unwrap() {
              group
            } else {
              unimplemented!();
            };

            let mut group_tokens = group.stream().into_iter();

            let object_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let object = group_tokens.next().unwrap();

            let _puntc_sign = group_tokens.next().unwrap();

            let fn_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let fn_data = group_tokens.next().unwrap();

            if object_key.to_string() == "object" && fn_key.to_string() == "fn" {
              //println!("{} = {}", object_key, object);
              //println!("{} = {}", fn_key, fn_data);

              let new_update_middleware = quote! {
                let new_value = #object.#fn_data(new_value).unwrap();
              };

              update_msg_middlewares.push(new_update_middleware);
            }
          }

          if key.as_str() == "create_middleware" {
            //println!("{}", key);
            let group = if let proc_macro2::TokenTree::Group(group) = val_iter.next().unwrap() {
              group
            } else {
              unimplemented!();
            };

            let mut group_tokens = group.stream().into_iter();

            let object_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let object = group_tokens.next().unwrap();

            let _puntc_sign = group_tokens.next().unwrap();

            let fn_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let fn_data = group_tokens.next().unwrap();

            if object_key.to_string() == "object" && fn_key.to_string() == "fn" {
              //println!("{} = {}", object_key, object);
              //println!("{} = {}", fn_key, fn_data);

              let new_middleware = quote! {
                let new_value = #object.#fn_data(new_value).unwrap();
              };

              create_msg_middlewares.push(new_middleware);
            }
          }

          if key.as_str() == "update_middleware_after" {
            //println!("{}", key);
            let group = if let proc_macro2::TokenTree::Group(group) = val_iter.next().unwrap() {
              group
            } else {
              unimplemented!();
            };

            let mut group_tokens = group.stream().into_iter();

            let object_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let object = group_tokens.next().unwrap();

            let _puntc_sign = group_tokens.next().unwrap();

            let fn_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let fn_data = group_tokens.next().unwrap();

            if object_key.to_string() == "object" && fn_key.to_string() == "fn" {
              //println!("{} = {}", object_key, object);
              //println!("{} = {}", fn_key, fn_data);

              let new_update_middleware = quote! {
                #object.#fn_data().await.unwrap();
              };

              update_msg_after_middlewares.push(new_update_middleware);
            }
          }

          if key.as_str() == "create_middleware_after" {
            //println!("{}", key);
            let group = if let proc_macro2::TokenTree::Group(group) = val_iter.next().unwrap() {
              group
            } else {
              unimplemented!();
            };

            let mut group_tokens = group.stream().into_iter();

            let object_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let object = group_tokens.next().unwrap();

            let _puntc_sign = group_tokens.next().unwrap();

            let fn_key = group_tokens.next().unwrap();
            let _equal_sign = group_tokens.next().unwrap();
            let fn_data = group_tokens.next().unwrap();

            if object_key.to_string() == "object" && fn_key.to_string() == "fn" {
              //println!("{} = {}", object_key, object);
              //println!("{} = {}", fn_key, fn_data);

              let new_middleware = quote! {
                #object.#fn_data().await.unwrap();
              };

              create_msg_after_middlewares.push(new_middleware);
            }
          }

          // let has_equal_sign = val_iter.next().unwrap().to_string() == "=";
          // let data = val_iter.next().unwrap().to_string();

          // println!("{} -> {} = {}", header, key, data);

          // let key = val_iter.next().unwrap().to_string();
          // let has_equal_sign = val_iter.next().unwrap().to_string() == "=";
          // let data = val_iter.next().unwrap().to_string();

          // println!("{} -> {} = {}", header, key, data);
        }
        "custom_sea_orm" => {
          let mut val_iter = value.tokens.into_iter();
          let key = val_iter.next().unwrap().to_string();

          let _has_equal_sign = val_iter.next().unwrap().to_string() == "=";
          let data = val_iter.next().unwrap().to_string().replace("\"", "");

          //println!("\n\n{} -> {} = {}\n\n", header, key, quote! {#data});

          match key.as_str() {
            "model" => {
              sea_orm_model_obj = data;
            }
            "entity" => {
              sea_orm_entity_obj = data;
            }
            _ => {}
          }
        }
        _ => {}
      }
    }
  });

  let sea_orm_active_model_obj = syn::parse_str::<Path>(&sea_orm_model_obj.replace("Model", "ActiveModel")).unwrap();

  let sea_orm_model_obj = syn::parse_str::<Path>(&sea_orm_model_obj).unwrap();

  let sea_orm_entity_obj = syn::parse_str::<Path>(&sea_orm_entity_obj).unwrap();

  // println!("db_table_name = {}", db_table_name);

  let mut sql_create_query = format!("INSERT INTO {db_table_name} (created_at, updated_at, ").replace("\"", "");

  let mut sql_update_query = format!("UPDATE {db_table_name} SET ").replace("\"", "");

  let mut create_sea_orm_values = vec![];

  let mut update_sea_orm_values = vec![];

  let mut sql_create_query_fields = " VALUES (now(), now(), ".to_string();
  let mut sql_create_query_bind_list = vec![];

  let mut sql_update_query_bind_list = vec![];

  let get_graphql_query_name = Ident::new(&format!("get_{}", name.to_string().to_lowercase()), name.span());

  let create_graphql_query_name = Ident::new(&format!("create_{}", name.to_string().to_lowercase()), name.span());

  let update_graphql_query_name = Ident::new(&format!("update_{}", name.to_string().to_lowercase()), name.span());

  // let delete_graphql_query_name = Ident::new(&format!("delete_{}", name.to_string().to_lowercase()), name.span());

  let filter_name = Ident::new(&format!("{name}Filter"), Span::call_site());

  let input_name = Ident::new(&format!("{name}InputValues"), Span::call_site());

  let graphql_query_obj = Ident::new(&format!("GraphqlQuery{name}"), Span::call_site());

  let fields = if let Data::Struct(data) = ast.data {
    data.fields
  } else {
    panic!();
  };

  let mut acc_filter_fields: Vec<Field> = vec![];
  let mut acc_input_fields: Vec<Field> = vec![];

  let mut acc_filter_and_statements: Vec<TokenStream> = vec![];

  let mut acc_filter_or_statements: Vec<TokenStream> = vec![];

  let mut actor_storing_the_value = None;
  let mut actor_id_filter = None;
  let mut actor_id_filter_type = None;

  let mut sql_create_query_n = 1;
  let mut sql_update_query_n = 1;

  'fields_loop: for field in fields {
    let this_ident = field.ident.unwrap();
    let mut this_ident_sql = this_ident.clone();
    let this_type = field.ty.clone();

    let is_this_type_optional = field.ty.to_token_stream().to_string().contains("Option");

    let mut skip_on_data_handler_create_values = false;
    let mut skip_on_data_handler_update_values = false;

    match this_ident.to_string().as_str() {
      "data_handler" => {
        continue;
      }
      "id" => {
        skip_on_data_handler_create_values = true;
        skip_on_data_handler_update_values = true;
      }
      _ => {}
    };

    //println!("attrs list for {}", this_ident);

    for att in field.attrs.clone() {
      match att.meta {
        syn::Meta::List(v) => {
          let path = v.path.get_ident().unwrap().to_string();
          let tokens = v.tokens;

          if &path == "filterable" && &tokens.to_string() == "skip" {
            continue 'fields_loop;
          }

          if &path == "actor_id" {
            actor_id_filter = Some(this_ident.clone());
            actor_id_filter_type = Some(this_type.clone());
            actor_storing_the_value = Some(Ident::new(&tokens.to_string(), tokens.span()));
          }

          if &path == "data_handler" && &tokens.to_string() == "skip_update" {
            skip_on_data_handler_update_values = true;
          }

          if &path == "data_handler" && &tokens.to_string() == "skip_on_create" {
            skip_on_data_handler_create_values = true;
          }

          if &path == "data_handler" && tokens.to_string().contains("rename") {
            //println!("\n\n\n\nMeta::List {:?}\n\n\n\n", &tokens.to_string());

            let new_name = tokens.to_string().replace("rename = ", "").replace("\"", "");
            this_ident_sql = Ident::new(&new_name, this_ident.span());

            //println!("new_name = {}", new_name);
          }
        }
        syn::Meta::Path(_) => {
          // let value = v.get_ident().unwrap().to_string();

          // if &value == "actor_id" {
          //   actor_id_filter = Some(value.clone());
          // }

          //println!("Meta::Path {:?}", v);
        }
        _ => unimplemented!("{:?}", att.meta),
      }
    }

    //println!("end of attrs list");

    // TODO: add another customer derive attr #[data_handler(cant_update)] on each non updateable
    // field
    if !skip_on_data_handler_update_values {
      sql_update_query.push_str(&format!("{this_ident_sql} = ${sql_update_query_n}, "));
      sql_update_query_bind_list.push(quote! {.bind(new_value.#this_ident)});
      sql_update_query_n += 1;

      // sea_orm
      update_sea_orm_values.push(quote! {
        active_obj.#this_ident = sea_orm::Set(self.new_value.#this_ident.to_owned());
      });
    }

    if !skip_on_data_handler_create_values {
      sql_create_query.push_str(&format!("{this_ident_sql}, "));
      sql_create_query_fields.push_str(format!("${sql_create_query_n}, ").as_str());
      sql_create_query_bind_list.push(quote! {.bind(new_value.#this_ident)});
      sql_create_query_n += 1;

      // sea_orm
      create_sea_orm_values.push(quote! {
          created_active_value.#this_ident = sea_orm::Set(new_value.#this_ident.to_owned());
      });
    }

    let new_type_str = if is_this_type_optional {
      field.ty.to_token_stream().to_string()
    } else {
      format!("Option<{}>", field.ty.to_token_stream())
    };

    let filter_field = Field {
      attrs: vec![],
      vis: Visibility::Public(Pub(Span::call_site())),
      mutability: FieldMutability::None,
      ident: Some(Ident::new(&this_ident.clone().to_string(), Span::call_site())),
      ty: syn::parse_str(&new_type_str).unwrap(),
      colon_token: None,
    };

    acc_filter_fields.push(filter_field.clone());

    if !(skip_on_data_handler_create_values && skip_on_data_handler_update_values) {
      acc_input_fields.push(filter_field);
    }

    let self_ident = if is_this_type_optional {
      //println!("and is optional");
      quote! {#this_ident.clone().unwrap()}
    } else {
      quote! {#this_ident}
    };

    acc_filter_and_statements.push(quote! {
      if let Some(#this_ident) = filter_values.#this_ident {
        if self.#self_ident != #this_ident {
          return false
        }
      };
    });

    acc_filter_or_statements.push(quote! {
      if let Some(#this_ident) = filter_values.#this_ident {
        if self.#self_ident == #this_ident {
          return true
        }
      };
    });
  }

  // up to here we have "...SET a = $1, b = $2, c = $3, "
  sql_update_query.pop(); // for the last white space
  sql_update_query.pop(); // for the last comma
  // now we have "SET a = $1, b = $2, c = $3"
  sql_update_query.push_str(&format!(" WHERE id = ${sql_update_query_n} RETURNING *"));

  // up to here we have "INSERT INTO ... (a, b, c, "
  sql_create_query.pop(); // for the last white space
  sql_create_query.pop(); // for the last comma
  sql_create_query.push(')');
  // now we have "INSERT INTO ... (a, b, c)"

  // up to here we have "VALUES (?, ?, ?, "
  sql_create_query_fields.pop(); // for the last white space
  sql_create_query_fields.pop(); // for the last comma
  sql_create_query_fields.push(')');
  // now we have "VALUES (?, ?, ?)"

  // now we mix insert into with values to create just one query
  sql_create_query.push_str(sql_create_query_fields.as_str());

  sql_create_query.push_str(" RETURNING *");

  //println!("sql_create_query = {}", sql_create_query);
  //println!("sql_update_query = {}", sql_update_query);

  let actor_data_store_name = Ident::new(&format!("all_{}s", name.to_string().to_lowercase()), Span::call_site());

  // let mut send_msg_to_get_data = quote! {};

  let create_msg_struct = Ident::new(&format!("Create{name}Msg"), Span::call_site());

  let get_msg_struct = Ident::new(&format!("Get{name}Msg"), Span::call_site());

  let update_msg_struct = Ident::new(&format!("Update{name}Msg"), Span::call_site());

  let delete_msg_struct = Ident::new(&format!("Delete{name}Msg"), Span::call_site());

  let send_msg_fn = quote! {
      async fn get(router: &ActorsRouter, msg: #get_msg_struct) -> bool {
        let team = router.get_handle::<#actor_storing_the_value>(&msg.actor_id).unwrap();

        team.notify(msg).await.unwrap();

        tracing::info!("message sent to actor");

        true
      }


      // async fn update(router: &ActorsRouter, msg: #update_msg_struct) -> bool {
      //   let team = router.get_handle::<#actor_storing_the_value>(&msg.actor_id).unwrap();

      //   team.notify(msg).await.unwrap();

      //   tracing::info!("message sent to actor");

      //   true
      // }

      // async fn delete(router: &ActorsRouter, msg: #delete_msg_struct) -> bool {
      //   let team = router.get_handle::<#actor_storing_the_value>(&msg.actor_id).unwrap();

      //   team.notify(msg).await.unwrap();

      //   tracing::info!("message sent to actor");

      //   true
      // }

  };

  let impl_update_and_create_message = quote! {
    impl janium_actors::Message<#actor_storing_the_value> for #update_msg_struct {
      type Return = crate::Result<bool>;

      async fn handle(self, actor: &mut #actor_storing_the_value, router: &ActorsRouter) -> Self::Return {
        tracing::debug!("received {:?} request", self);

        let new_value = self.new_value.clone();

        let data_handler = actor.data_handler.clone().ok_or(janium_actors::ActorError::DeadActor("data_handler not available".to_string()))?;


        #( #update_msg_middlewares ) *

        if !actor.#actor_data_store_name.contains_key(&self.value_id) {
          tracing::info!("value not found on Actor");
          return Err(crate::error::JaniumError::any("value not found on Actor"));
        }


        tracing::info!("running query with sea_orm\n");
        let db = data_handler.db.clone();

        let db: DatabaseConnection = db.into();


        let obj: Option<#sea_orm_model_obj> = #sea_orm_entity_obj::find_by_id(self.value_id).one(&db).await.unwrap();

        tracing::info!("value to update found on db");

        let mut active_obj: ActiveModel = obj.unwrap().into();

        #( #update_sea_orm_values ) *

        let updated_obj: #sea_orm_model_obj = active_obj.update(&db).await.unwrap();

        let updated_obj_from_db = #sea_orm_entity_obj::find_by_id(self.value_id).one(&db).await.unwrap().unwrap();

        // TODO: this self.filter.clone() will be replaced ASAP
        match actor.#actor_data_store_name.insert(self.value_id, updated_obj_from_db.into()) {
          Some(_) => tracing::debug!("value updated on Actor"),
          None => tracing::debug!("obj created on Actor")
        };

        #( #update_msg_after_middlewares ) *

        tracing::info!("value updated");

        Ok(true)


      }
    }


    impl janium_actors::Message<#actor_storing_the_value> for #create_msg_struct {
      type Return = crate::Result<uuid::Uuid>;

      async fn handle(self, actor: &mut #actor_storing_the_value, router: &ActorsRouter) -> Self::Return {
        tracing::debug!("received {:?} request", self);

        let new_value = self.new_value.clone();

        let data_handler = actor.data_handler.clone().ok_or(janium_actors::ActorError::DeadActor("data_handler not available".to_string()))?;


        let db = data_handler.db.clone();

        let db: DatabaseConnection = db.into();


        #( #create_msg_middlewares ) *

        tracing::info!("building active_value");

        let mut created_active_value = #sea_orm_active_model_obj {
            ..Default::default()
        };

        #( #create_sea_orm_values ) *

        tracing::info!("filled active_value with new_values data");

        tracing::info!("executing insert query with sea_orm\n");

        let res: sea_orm::InsertResult<#sea_orm_active_model_obj> = #sea_orm_entity_obj::insert(created_active_value).exec(&db).await.unwrap();

        let new_value_id = res.last_insert_id;

        tracing::info!("obj created on db with sea_orm id = {:?}", new_value_id);


        // TODO: this self.filter.clone() will be replaced ASAP
        match actor.#actor_data_store_name.insert(new_value_id, new_value.clone()) {
          Some(_) => tracing::debug!("value updated on Actor"),
          None => tracing::debug!("obj created on Actor")
        };

        #( #create_msg_after_middlewares ) *



        Ok(new_value_id)


      }
    }

  };

  let impl_messages = quote! {
    impl janium_actors::Message<#actor_storing_the_value> for #get_msg_struct {
      type Return = crate::Result<Vec<#name>>;

      async fn handle(self, actor: &mut #actor_storing_the_value, router: &ActorsRouter) -> Self::Return {
        tracing::debug!("received {:?} request", self);
        tracing::debug!("filter = {:?}", self.filter);

        // TODO: this self.filter.clone() will be replaced ASAP
        let mut value: Vec<#name> = actor.#actor_data_store_name.values().into_iter().filter(|obj| obj.filter_and(self.filter.clone())).map(|v| v.clone()).collect();

        if let Some(limit) = self.filter.limit {
          value.truncate(limit);
        }

        //let value = actor.#actor_data_store_name.get(&self.filter.id.unwrap()).cloned();

        tracing::info!("search result = {:?}", value);

        if value.is_empty() {
          tracing::info!("all_theactorstore = {:?}", actor.#actor_data_store_name);
        }

        Ok(value)


      }
    }

    #impl_update_and_create_message



    /*
    impl janium_actors::Message<#actor_storing_the_value> for #delete_msg_struct {
      type Return = bool;

      async fn handle(self, actor: &mut #actor_storing_the_value, router: &ActorsRouter) -> janium_actors::ActorResult<Self::Return> {
        tracing::debug!("received {:?} request", self);
        tracing::debug!("id = {}", self.value_id);

        // TODO: this self.filter.clone() will be replaced ASAP
        match actor.#actor_data_store_name.remove(self.value_id) {
          Ok(_) => tracing::info!("value deleted"),
          None => tracing::info!("obj not found")
        };

        // match actor.data_handler.#delete_graphql_query_name(self.value_id).await {
        //   Ok(_) => tracing::info!("value deleted on database");
        //   Err(e) => {
        //     tracing::error!("error while deleting value on database = {:?}", e);
        //     return Err(ActorError(e.to_string().into()));
        //   }
        // }


        Ok(true)


      }
    }
    */

  };

  let generated = quote! {
    #[derive(Clone, Default, Debug, async_graphql::InputObject)]
    pub struct #filter_name {
      #( #acc_filter_fields ), *,
      //pub check_disable_campaign_intervals: Option<bool>,
      //pub only_active_campaign_step: bool,
      //pub oldest_continue_after_first: bool,
      pub limit: Option<usize>,
    }


    #[derive(Clone, Default, Debug, async_graphql::InputObject)]
    pub struct #input_name {
      #( #acc_input_fields ), *,
    }

    impl #name {
      pub fn filter_and(&self, filter_values: #filter_name) -> bool {
        #( #acc_filter_and_statements ) *
        true
      }

      pub fn filter_or(&self, filter_values: #filter_name) -> bool {
        #( #acc_filter_or_statements ) *
        false
      }

      #send_msg_fn
    }

    #[derive(Debug)]
    pub struct #get_msg_struct {
      filter: #filter_name,
      actor_id: #actor_id_filter_type
    }

    impl #get_msg_struct {
      pub fn id(value_id: uuid::Uuid, actor_id: #actor_id_filter_type) -> Self {
        Self {
          filter: #filter_name {
            id: Some(value_id),
            ..Default::default()
          },
          actor_id
        }
      }
    }

    #[derive(Debug)]
    pub struct #create_msg_struct {
      pub actor_id: #actor_id_filter_type,
      pub new_value: #name
    }


    #[derive(Debug)]
    pub struct #update_msg_struct {
      pub value_id: uuid::Uuid,
      pub actor_id: #actor_id_filter_type,
      pub new_value: #name
    }

    #[derive(Debug)]
    pub struct #delete_msg_struct {
      pub filter: #filter_name,
      pub actor_id: #actor_id_filter_type,
    }

    #impl_messages

    #[async_graphql::Object]
    impl #graphql_query_obj {
      async fn #get_graphql_query_name<'a>(
        &self,
        ctx: &async_graphql::Context<'a>,
        #actor_id_filter: #actor_id_filter_type,
        filter: #filter_name
      ) -> async_graphql::Result<Vec<#name>> {
        let actor_sender_lock = ctx
          .data::<std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<#actor_id_filter_type, janium_actors::Sender<#actor_storing_the_value>>>>>()
          .map_err(|e| crate::error::JaniumError::Any(e.message.into()))?
          .lock() // TODO: do we need to lock here???
          .await;

        let actor_sender = actor_sender_lock
          .get(&#actor_id_filter)
          .ok_or(crate::error::JaniumError::Any("Worker not found".into()))?;


        tracing::info!("actor sender found");

        tracing::info!("sending get message to actor");

        let result = actor_sender
          .send(#get_msg_struct{ actor_id: #actor_id_filter,  filter })
          .await
          ??;

        Ok(result)
      }

      async fn #update_graphql_query_name<'a>(
        &self,
        ctx: &async_graphql::Context<'a>,
        #actor_id_filter: #actor_id_filter_type,
        new_value: #name,
        value_id: uuid::Uuid,
      ) -> async_graphql::Result<bool> {
        let actor_sender_lock = ctx
          .data::<std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<#actor_id_filter_type, janium_actors::Sender<#actor_storing_the_value>>>>>()
          .map_err(|e| crate::error::JaniumError::Any(e.message.into()))?
          .lock() // TODO: do we need to lock here???
          .await;

        let actor_sender = actor_sender_lock
          .get(&#actor_id_filter)
          .ok_or(crate::error::JaniumError::Any("Worker not found".into()))?;


        tracing::info!("actor sender found");

        tracing::info!("sending update message to actor");

        let result = actor_sender
          .send(#update_msg_struct{ value_id, actor_id: #actor_id_filter,  new_value })
          .await
          ??;

        Ok(result)
      }


      async fn #create_graphql_query_name<'a>(
        &self,
        ctx: &async_graphql::Context<'a>,
        #actor_id_filter: #actor_id_filter_type,
        new_value: #name,
      ) -> async_graphql::Result<uuid::Uuid> {
        let actor_sender_lock = ctx
          .data::<std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<#actor_id_filter_type, janium_actors::Sender<#actor_storing_the_value>>>>>()
          .map_err(|e| crate::error::JaniumError::Any(e.message.into()))?
          .lock() // TODO: do we need to lock here???
          .await;

        let actor_sender = actor_sender_lock
          .get(&#actor_id_filter)
          .ok_or(crate::error::JaniumError::Any("Worker not found".into()))?;

        tracing::info!("actor sender found");

        tracing::info!("sending create message to actor");

        let result = actor_sender
          .send(#create_msg_struct{ actor_id: #actor_id_filter,  new_value })
          .await??;

        Ok(result)

      }

    }

  };

  // if name.to_string() == "CampaignStepActors" {
  //   println!("\n\n");
  //   println!("{}", gen);
  //   println!("\n\n");
  // }

  generated.into()
}

#[derive(deluxe::ParseAttributes, Debug, Default)]
#[deluxe(attributes(aliases), default)]
struct AliasFieldOpts(Vec<String>);

/// Creates a method `replace_aliases(header: String) -> String` that takes each of the provided aliases and generates a bunch of variations and then
/// replaces that in the string
/// ```rust
///
/// #[derive(janium_derive::Aliases)]
/// pub struct TestDerive {
///   #[aliases(["email"])]
///   pub best_email: String,
///   pub first_name: String,
/// }
///
/// let replaced = TestDerive::replace_aliases("Best Email");
/// assert_eq!("best_email", replaced);
/// ```
///
/// Aliases need to be unique
/// ```rust,compile_fail
/// #[derive(janium_derive::Aliases)]
/// pub struct TestDerive2 {
///   #[aliases(["email"])]
///   pub best_email: String,
///   pub email: String,
/// }
/// ```
///
/// /// Aliases cannot contain commas
/// ```rust,compile_fail
/// #[derive(janium_derive::Aliases)]
/// pub struct TestDerive3 {
///   #[aliases(["best, email"])]
///   pub best_email: String,
/// }
/// ```
#[proc_macro_derive(Aliases, attributes(aliases))]
pub fn derive_aliases(item: proc_macro::TokenStream) -> proc_macro::TokenStream {
  derive_aliases_inner(item.into())
    .unwrap_or_else(|e| e.into_compile_error())
    .into()
}

fn derive_aliases_inner(item: proc_macro2::TokenStream) -> deluxe::Result<proc_macro2::TokenStream> {
  let input = syn::parse2::<syn::DeriveInput>(item)?;

  let mut aliases = Vec::new();
  if let syn::Data::Struct(s) = input.data {
    // Look through all fields in the struct for `author` attributes
    for field in s.fields {
      let span = field.span();
      let field_name = field
        .ident
        .as_ref()
        .ok_or_else(|| deluxe::Error::new(span, "Unnamed fields are not supported"))?
        .to_string();
      let mut alias = deluxe::parse_attributes::<_, AliasFieldOpts>(&field)?.0;
      alias.push(field_name.clone());
      aliases.push((field_name, alias));
    }
  }

  // Ensure this can be called
  let _ = janium_derive_core::replace_aliases(
    "",
    aliases
      .iter()
      .map(|(field_name, aliases)| (field_name.as_str(), aliases.iter().map(|s| s.as_str()))),
  );

  let aliases = aliases.into_iter().map(|(field_name, alias)| {
    let alias_roots = alias.iter().map(|a| quote!(#a));
    quote! {
      (#field_name, &[#(#alias_roots),*])
    }
  });

  let ident = &input.ident;
  let (impl_generics, type_generics, where_clause) = input.generics.split_for_impl();

  let output = quote::quote! {
    impl #impl_generics #ident #type_generics #where_clause {
      pub fn replace_aliases(first_line: &str) -> String {
        static ALIASES: &[(&'static str, &[&'static str])] = &[#(#aliases),*];
          janium_derive_core::replace_aliases(first_line, ALIASES
            .iter()
            .map(|(field_name, alias_roots)| (*field_name, alias_roots.iter().map(|r| *r))),
        )
      }
    }
  };
  Ok(output)
}
