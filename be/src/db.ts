/* db.ts – single shared pg Pool  */
import { Pool } from 'pg';

export const pool = new Pool({
    host    : process.env.DB_HOST || 'db',      // docker-compose service name
    port    : Number(process.env.DB_PORT) || 5432,
    user    : process.env.DB_USER || 'postgres',
    password: process.env.DB_PASS || 'postgres',
    database: process.env.DB_NAME || 'echodb',
});
