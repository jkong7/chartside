import pg from "pg";

const url = process.env.DATABASE_URL;
if (url) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
  await client.end();
  console.log("reset postgres schema");
}
