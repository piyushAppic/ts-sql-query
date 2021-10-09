/*
 * sudo apt-get install build-essential
 * npm install better-sqlite3
 * npm install synchronous-promise
 */

import { Table } from "../Table";
import { assertEquals } from "./assertEquals";
import { ConsoleLogQueryRunner } from "../queryRunners/ConsoleLogQueryRunner";
import { SqliteConnection } from "../connections/SqliteConnection";
import { BetterSqlite3QueryRunner } from "../queryRunners/BetterSqlite3QueryRunner";
import * as betterSqlite3 from 'better-sqlite3'
import { SynchronousPromise } from "synchronous-promise";

class DBConection extends SqliteConnection<'DBConnection'> {
    compatibilityMode = false
}

const tCompany = new class TCompany extends Table<DBConection, 'TCompany'> {
    id = this.autogeneratedPrimaryKey('id', 'int');
    name = this.column('name', 'string');
    constructor() {
        super('company'); // table name in the database
    }
}()

const tCustomer = new class TCustomer extends Table<DBConection, 'TCustomer'> {
    id = this.autogeneratedPrimaryKey('id', 'int');
    firstName = this.column('first_name', 'string');
    lastName = this.column('last_name', 'string');
    birthday = this.optionalColumn('birthday', 'localDate');
    companyId = this.column('company_id', 'int');
    constructor() {
        super('customer'); // table name in the database
    }
}()

const db = betterSqlite3(':memory:')

function main() {
    const connection = new DBConection(new ConsoleLogQueryRunner(new BetterSqlite3QueryRunner(db, { promise: SynchronousPromise })))
    sync(connection.beginTransaction())

    let commit = false
    try {
        sync(connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists customer`))
        sync(connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists company`))

        sync(connection.queryRunner.executeDatabaseSchemaModification(`
            create table company (
                id integer primary key autoincrement,
                name varchar(100) not null
            )
        `))

        sync(connection.queryRunner.executeDatabaseSchemaModification(`
            create table customer (
                id integer primary key autoincrement,
                first_name varchar(100) not null,
                last_name varchar(100) not null,
                birthday date,
                company_id int not null references company(id)
            )
        `))

        let i = sync(connection
            .insertInto(tCompany)
            .values({ name: 'ACME' })
            .returningLastInsertedId()
            .executeInsert())
        assertEquals(i, 1)

        i = sync(connection
            .insertInto(tCompany)
            .values({ name: 'FOO' })
            .executeInsert())
        assertEquals(i, 1)

        i = sync(connection
            .insertInto(tCustomer)
            .values({ firstName: 'John', lastName: 'Smith', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert())
        assertEquals(i, 1)
                
        i = sync(connection
            .insertInto(tCustomer)
            .values({ firstName: 'Other', lastName: 'Person', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert())
        assertEquals(i, 2)

        i = sync(connection
            .insertInto(tCustomer)
            .values({ firstName: 'Jane', lastName: 'Doe', companyId: 1 })
            .returningLastInsertedId()
            .executeInsert())
        assertEquals(i, 3)

        let company = sync(connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .executeSelectOne())
        assertEquals(company, { id: 1, name: 'ACME' })

        let companies = sync(connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .orderBy('id')
            .executeSelectMany())
        assertEquals(companies, [{ id: 1, name: 'ACME' }, { id: 2, name: 'FOO' }])

        let name = sync(connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .selectOneColumn(tCompany.name)
            .executeSelectOne())
        assertEquals(name, 'ACME')

        let names = sync(connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany())
        assertEquals(names, ['ACME', 'FOO'])

        i = sync(connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 2')
                })
            )
            .executeInsert())
        assertEquals(i, 2)

        names = sync(connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany())
        assertEquals(names, ['ACME', 'ACME 2', 'FOO', 'FOO 2'])

        const fooComanyNameLength = connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name.length())
            .where(tCompany.id.equals(2))
            .forUseAsInlineQueryValue()

        companies = sync(connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .where(tCompany.name.length().greaterThan(fooComanyNameLength))
            .orderBy('id')
            .executeSelectMany())
        assertEquals(companies, [{ id: 1, name: 'ACME' },{ id: 3, name: 'ACME 2' }, { id: 4, name: 'FOO 2'}])

        i = sync(connection
            .update(tCompany)
            .set({
                name: tCompany.name.concat(tCompany.name)
            })
            .where(tCompany.id.equals(2))
            .executeUpdate())
        assertEquals(i, 1)

        name = sync(connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
            .selectOneColumn(tCompany.name)
            .executeSelectOne())
        assertEquals(name, 'FOOFOO')

        i = sync(connection
            .deleteFrom(tCompany)
            .where(tCompany.id.equals(2))
            .executeDelete())
        assertEquals(i, 1)

        let maybe = sync(connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
            .selectOneColumn(tCompany.name)
            .executeSelectNoneOrOne())
        assertEquals(maybe, null)

        let page = sync(connection
            .selectFrom(tCustomer)
            .select({
                id: tCustomer.id,
                name: tCustomer.firstName.concat(' ').concat(tCustomer.lastName)
            })
            .orderBy('id')
            .limit(2)
            .executeSelectPage())
        assertEquals(page, {
            count: 3,
            data: [
                { id: 1, name: 'John Smith' },
                { id: 2, name: 'Other Person' }
            ]
        })

        const customerCountPerCompanyWith = connection.selectFrom(tCompany)
            .innerJoin(tCustomer).on(tCustomer.companyId.equals(tCompany.id))
            .select({
                companyId: tCompany.id,
                companyName: tCompany.name,
                endsWithME: tCompany.name.endsWithInsensitive('me'),
                customerCount: connection.count(tCustomer.id)
            }).groupBy('companyId', 'companyName', 'endsWithME')
            .forUseInQueryAs('customerCountPerCompany')

        const customerCountPerAcmeCompanies = sync(connection.selectFrom(customerCountPerCompanyWith)
            .where(customerCountPerCompanyWith.companyName.containsInsensitive('ACME'))
            .select({
                acmeCompanyId: customerCountPerCompanyWith.companyId,
                acmeCompanyName: customerCountPerCompanyWith.companyName,
                acmeEndsWithME: customerCountPerCompanyWith.endsWithME,
                acmeCustomerCount: customerCountPerCompanyWith.customerCount
            })
            .executeSelectMany())
        assertEquals(customerCountPerAcmeCompanies, [
            { acmeCompanyId: 1, acmeCompanyName: 'ACME', acmeEndsWithME: true, acmeCustomerCount: 3 }
        ])

        commit = true
    } finally {
        if (commit) {
            connection.commit()
        } else {
            connection.rollback()
        }
    }
}

try {
    main()
    console.log('All ok')
    process.exit(0)
} catch (e) {
    console.error(e)
    process.exit(1)
}

/**
 * This function unwrap the syncronous promise in a syncronous way returning the result.
 */
function sync<T>(promise: Promise<T>): T {
    let returned = false
    let errorReturned = false
    let result: any
    let error: any
    promise.then(r => {
        returned = true
        result = r
    }, e => {
        errorReturned = true
        error = e
    })

    if (!returned && !errorReturned) {
        throw new Error('You performed a real async operation, not a database operation, inside the function dedicated to calling the database')
    }
    if (errorReturned) {
        throw error
    }
    return result
}