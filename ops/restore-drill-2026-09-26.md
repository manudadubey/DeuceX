# Restore drill, 2026-09-26T03:54:04Z

**Result: PASS**

Production dump restored into a throwaway local Postgres 17.11, then deleted with the cluster. Counts only; no row data in this report.

| Check                                | Result                                              |
| ------------------------------------ | --------------------------------------------------- |
| Dump                                 | 896K, 36s (schemas public, auth, pgboss)            |
| Restore                              | 0s, 1 statement error(s) (Supabase-only extensions) |
| Public tables                        | 60                                                  |
| Rows, production vs restored         | 11904 rows, match: yes                              |
| RLS switches and policy counts       | match: yes                                          |
| console cannot read notes.transcript | yes                                                 |

Restore errors (first 10):

```
pg_restore: error: could not execute query: ERROR:  schema "public" already exists
```
