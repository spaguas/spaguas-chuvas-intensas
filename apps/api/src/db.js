import knex from 'knex';
import { config } from './config.js';
export const db=knex({client:'pg',connection:config.DATABASE_URL,pool:{min:0,max:10},acquireConnectionTimeout:10000});
