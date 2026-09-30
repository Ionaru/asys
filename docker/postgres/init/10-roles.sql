-- SPDX-License-Identifier: EUPL-1.2
-- Creates the ASYS roles and database on first start (ADR 0007). The postgres image
-- runs this file with psql and ON_ERROR_STOP, as the superuser, against the postgres database.
-- asys_owner owns the tables and runs migrations; asys_app owns nothing and is
-- subject to row-level security; asys_lookup owns only the SECURITY DEFINER
-- lookup functions and bypasses row-level security (only a superuser can create it).
\getenv owner_pw ASYS_OWNER_PASSWORD
\getenv app_pw ASYS_APP_PASSWORD
CREATE ROLE asys_owner LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'owner_pw';
CREATE ROLE asys_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS PASSWORD :'app_pw';
CREATE ROLE asys_lookup NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE BYPASSRLS;
GRANT asys_lookup TO asys_owner WITH INHERIT FALSE, SET TRUE;
CREATE DATABASE asys OWNER asys_owner;
REVOKE ALL ON DATABASE asys FROM PUBLIC;
GRANT CONNECT ON DATABASE asys TO asys_owner, asys_app;
