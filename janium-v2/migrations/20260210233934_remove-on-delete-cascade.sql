-- SELECT
--     c.conname AS constraint_name,                                                                                                                                                                                                        
--     src.relname AS table_name,                                                                                                                                                                                                        
--     string_agg(sa.attname, ', ') AS columns,                                                                                                                                                               
--     tgt.relname AS referenced_table,                                                                                                                                                                                                     
--     string_agg(ta.attname, ', ') AS referenced_columns,
--     format('ALTER TABLE %I DROP CONSTRAINT %I;', src.relname, c.conname) AS drop_stmt,
--     format('ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (%s) REFERENCES %I(%s);',
--         src.relname,
--         c.conname,
--         string_agg(quote_ident(sa.attname), ', '),
--         tgt.relname,
--         string_agg(quote_ident(ta.attname), ', ')
--     ) AS add_stmt
-- FROM pg_constraint c
-- JOIN pg_class src ON src.oid = c.conrelid
-- JOIN pg_class tgt ON tgt.oid = c.confrelid
-- JOIN pg_namespace ns ON ns.oid = src.relnamespace
-- JOIN pg_attribute sa ON sa.attrelid = c.conrelid AND sa.attnum = ANY(c.conkey)
-- JOIN pg_attribute ta ON ta.attrelid = c.confrelid AND ta.attnum = ANY(c.confkey)
-- WHERE c.contype = 'f'
--   AND c.confdeltype = 'c'
--   AND ns.nspname = 'public'
-- GROUP BY c.conname, src.relname, tgt.relname
-- ORDER BY src.relname, c.conname;

 ALTER TABLE campaign DROP CONSTRAINT campaign_default_email_group_fkey;
 ALTER TABLE campaign ADD CONSTRAINT campaign_default_email_group_fkey FOREIGN KEY (default_email_group) REFERENCES email_group(id);
 
 ALTER TABLE campaign DROP CONSTRAINT campaign_team_id_fkey;
 ALTER TABLE campaign ADD CONSTRAINT campaign_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
 
 ALTER TABLE campaign_contact DROP CONSTRAINT campaign_contact_campaign_id_fkey;
 ALTER TABLE campaign_contact ADD CONSTRAINT campaign_contact_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaign(id);
 
 ALTER TABLE campaign_contact DROP CONSTRAINT campaign_contact_contact_id_fkey;
 ALTER TABLE campaign_contact ADD CONSTRAINT campaign_contact_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contact(id);
 
 ALTER TABLE campaign_step DROP CONSTRAINT campaign_step_campaign_id_fkey;
 ALTER TABLE campaign_step ADD CONSTRAINT campaign_step_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaign(id);
 
 ALTER TABLE campaign_step_link DROP CONSTRAINT campaign_step_link_campaign_id_fkey;
 ALTER TABLE campaign_step_link ADD CONSTRAINT campaign_step_link_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaign(id);
 
 ALTER TABLE campaign_step_link DROP CONSTRAINT campaign_step_link_next_fkey;
 ALTER TABLE campaign_step_link ADD CONSTRAINT campaign_step_link_next_fkey FOREIGN KEY (next) REFERENCES campaign_step(id);
 
 ALTER TABLE campaign_step_link DROP CONSTRAINT campaign_step_link_prev_fkey;
 ALTER TABLE campaign_step_link ADD CONSTRAINT campaign_step_link_prev_fkey FOREIGN KEY (prev) REFERENCES campaign_step(id);
 
 ALTER TABLE contact DROP CONSTRAINT contact_company_id_fkey;
 ALTER TABLE contact ADD CONSTRAINT contact_company_id_fkey FOREIGN KEY (company_id) REFERENCES company(id);
 
 ALTER TABLE contact_list DROP CONSTRAINT contact_list_team_id_fkey;
 ALTER TABLE contact_list ADD CONSTRAINT contact_list_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
 
 ALTER TABLE contact_list_contact DROP CONSTRAINT contact_list_contact_contact_id_fkey;
 ALTER TABLE contact_list_contact ADD CONSTRAINT contact_list_contact_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contact(id);
 
 ALTER TABLE contact_list_contact DROP CONSTRAINT contact_list_contact_contact_list_id_fkey;
 ALTER TABLE contact_list_contact ADD CONSTRAINT contact_list_contact_contact_list_id_fkey FOREIGN KEY (contact_list_id) REFERENCES contact_list(id);
 
 ALTER TABLE email_action DROP CONSTRAINT email_action_campaign_id_fkey;
 ALTER TABLE email_action ADD CONSTRAINT email_action_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES campaign(id);
 
 ALTER TABLE email_action DROP CONSTRAINT email_action_contact_id_fkey;
 ALTER TABLE email_action ADD CONSTRAINT email_action_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contact(id);
 
 ALTER TABLE email_action DROP CONSTRAINT email_action_team_id_fkey;
 ALTER TABLE email_action ADD CONSTRAINT email_action_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
 
 ALTER TABLE email_domain DROP CONSTRAINT email_domain_team_id_fkey;
 ALTER TABLE email_domain ADD CONSTRAINT email_domain_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
 
 ALTER TABLE email_group DROP CONSTRAINT email_group_team_id_fkey;
 ALTER TABLE email_group ADD CONSTRAINT email_group_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
 
 ALTER TABLE email_group_relation DROP CONSTRAINT email_group_relation_email_fkey;
 ALTER TABLE email_group_relation ADD CONSTRAINT email_group_relation_email_fkey FOREIGN KEY (email) REFERENCES email(email);
 
 ALTER TABLE email_group_relation DROP CONSTRAINT email_group_relation_email_group_id_fkey;
 ALTER TABLE email_group_relation ADD CONSTRAINT email_group_relation_email_group_id_fkey FOREIGN KEY (email_group_id) REFERENCES email_group(id);
 
 ALTER TABLE invite DROP CONSTRAINT invite_team_id_fkey;
 ALTER TABLE invite ADD CONSTRAINT invite_team_id_fkey FOREIGN KEY (team_id) REFERENCES team(id);
