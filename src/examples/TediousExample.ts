/*
 * npm install tedious
 * docker run --name ts-sql-query-sqlserver -e 'ACCEPT_EULA=Y' -e 'SA_PASSWORD=yourStrong(!)Password' -e 'MSSQL_PID=Express' -p 1433:1433 -d mcr.microsoft.com/mssql/server:2017-latest-ubuntu
 */

import { Connection } from 'tedious'
import { Table } from "../Table";
import { assertEquals } from "./assertEquals";
import { ConsoleLogQueryRunner } from "../queryRunners/ConsoleLogQueryRunner";
import { SqlServerConnection } from "../connections/SqlServerConnection";
import { TediousQueryRunner } from '../queryRunners/TediousQueryRunner';

class DBConection extends SqlServerConnection<'DBConnection'> {
    increment(i: number) {
        return this.executeFunction('dbo.increment', [this.const(i, 'int')], 'int', 'required')
    }
    appendToAllCompaniesName(aditional: string) {
        return this.executeProcedure('append_to_all_companies_name', [this.const(aditional, 'string')])
    }
    customerSeq = this.sequence('customer_seq', 'int')
}

const tCompany = new class TCompany extends Table<DBConection, 'TCompany'> {
    id = this.autogeneratedPrimaryKey('id', 'int');
    name = this.column('name', 'string');
    parentId = this.optionalColumn('parent_id', 'int');
    constructor() {
        super('company'); // table name in the database
    }
}()

const tCustomer = new class TCustomer extends Table<DBConection, 'TCustomer'> {
    id = this.autogeneratedPrimaryKeyBySequence('id', 'customer_seq', 'int');
    firstName = this.column('first_name', 'string');
    lastName = this.column('last_name', 'string');
    birthday = this.optionalColumn('birthday', 'localDate');
    companyId = this.column('company_id', 'int');
    constructor() {
        super('customer'); // table name in the database
    }
}()

const tRecord = new class TRecord extends Table<DBConection, 'TRecord'> {
    id = this.primaryKey('id', 'uuid');
    title = this.column('title', 'string');
    constructor() {
        super('record'); // table name in the database
    }
}()


var connectionConfig = {  
    server: 'localhost',  //update me
    authentication: {
        type: 'default',
        options: {
            userName: 'sa', //update me
            password: 'yourStrong(!)Password'  //update me
        }
    },
    options: {
        trustServerCertificate: true
    }
}

var conn = new Connection(connectionConfig);

async function main() {
    const connection = new DBConection(new ConsoleLogQueryRunner(new TediousQueryRunner(conn)))
    await connection.beginTransaction()

    try {
        await connection.queryRunner.executeDatabaseSchemaModification(`
            drop table if exists customer;
            drop table if exists company;
            drop sequence if exists customer_seq;
            drop function if exists increment;
            drop procedure if exists append_to_all_companies_name;

            create table company (
                id int identity(1,1) primary key,
                name varchar(100) not null,
                parent_id int null references company(id)
            );

            create table customer (
                id int primary key,
                first_name varchar(100) not null,
                last_name varchar(100) not null,
                birthday date,
                company_id int not null references company(id)
            );

            create sequence customer_seq as int start with 1;
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create function increment(@i int) returns int as 
                begin
                    return @i + 1;
                end;
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`
            create procedure append_to_all_companies_name @aditional varchar(100) as
            begin
                update company set name = name + @aditional;
            end;
        `)

        await connection.queryRunner.executeDatabaseSchemaModification(`drop table if exists record`)
        await connection.queryRunner.executeDatabaseSchemaModification(`
            create table record (
                id uniqueidentifier primary key,
                title varchar(100) not null
            )
        `)

        let i = await connection
            .insertInto(tCompany)
            .values({ name: 'ACME' })
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(i, 1)

        i = await connection
            .insertInto(tCompany)
            .values({ name: 'FOO' })
            .executeInsert()
        assertEquals(i, 1)

        let ii = await connection
            .insertInto(tCustomer)
            .values([
                { firstName: 'John', lastName: 'Smith', companyId: 1 },
                { firstName: 'Other', lastName: 'Person', companyId: 1 },
                { firstName: 'Jane', lastName: 'Doe', companyId: 1 }
            ])
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(ii, [1, 2, 3])

        i = await connection
            .selectFromNoTable()
            .selectOneColumn(connection.customerSeq.currentValue())
            .executeSelectOne()
        assertEquals(i, 3)

        let company = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .executeSelectOne()
        assertEquals(company, { id: 1, name: 'ACME' })

        let companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 1, name: 'ACME' }, { id: 2, name: 'FOO' }])

        let name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME')

        let names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'FOO'])

        i = await connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 2')
                })
            )
            .executeInsert()
        assertEquals(i, 2)

        names = await connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name)
            .orderBy('result')
            .executeSelectMany()
        assertEquals(names, ['ACME', 'ACME 2', 'FOO', 'FOO 2'])

        const fooComanyNameLength = connection
            .selectFrom(tCompany)
            .selectOneColumn(tCompany.name.length())
            .where(tCompany.id.equals(2))
            .forUseAsInlineQueryValue()

        companies = await connection
            .selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name
            })
            .where(tCompany.name.length().greaterThan(fooComanyNameLength))
            .orderBy('id')
            .executeSelectMany()
        assertEquals(companies, [{ id: 1, name: 'ACME' },{ id: 3, name: 'ACME 2' }, { id: 4, name: 'FOO 2'}])

        i = await connection
            .update(tCompany)
            .set({
                name: tCompany.name.concat(tCompany.name)
            })
            .where(tCompany.id.equals(2))
            .executeUpdate()
        assertEquals(i, 1)

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'FOOFOO')

        i = await connection
            .deleteFrom(tCompany)
            .where(tCompany.id.equals(2))
            .executeDelete()
        assertEquals(i, 1)

        let maybe = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(2))
            .selectOneColumn(tCompany.name)
            .executeSelectNoneOrOne()
        assertEquals(maybe, null)

        let page = await connection
            .selectFrom(tCustomer)
            .select({
                id: tCustomer.id,
                name: tCustomer.firstName.concat(' ').concat(tCustomer.lastName)
            })
            .orderBy('id')
            .limit(2)
            .executeSelectPage()
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

        const customerCountPerAcmeCompanies = await connection.selectFrom(customerCountPerCompanyWith)
            .where(customerCountPerCompanyWith.companyName.containsInsensitive('ACME'))
            .select({
                acmeCompanyId: customerCountPerCompanyWith.companyId,
                acmeCompanyName: customerCountPerCompanyWith.companyName,
                acmeEndsWithME: customerCountPerCompanyWith.endsWithME,
                acmeCustomerCount: customerCountPerCompanyWith.customerCount
            })
            .executeSelectMany()
        assertEquals(customerCountPerAcmeCompanies, [
            { acmeCompanyId: 1, acmeCompanyName: 'ACME', acmeEndsWithME: true, acmeCustomerCount: 3 }
        ])

        const aggregatedCustomersOfAcme = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(connection.aggregateAsArray({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }))
            .forUseAsInlineQueryValue()

        const acmeCompanyWithCustomers = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme
            })
            .executeSelectOne()
        acmeCompanyWithCustomers.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const tCustomerLeftJoin = tCustomer.forUseInLeftJoin()
        const acmeCompanyWithCustomers2 = await connection.selectFrom(tCompany).leftJoin(tCustomerLeftJoin).on(tCustomerLeftJoin.companyId.equals(tCompany.id))
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: connection.aggregateAsArray({
                    id: tCustomerLeftJoin.id,
                    firstName: tCustomerLeftJoin.firstName,
                    lastName: tCustomerLeftJoin.lastName
                }).useEmptyArrayForNoValue()
            })
            .groupBy('id', 'name')
            .executeSelectOne()
        acmeCompanyWithCustomers2.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers2, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme3 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(connection.aggregateAsArrayOfOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName)))
            .forUseAsInlineQueryValue()

        const acmeCompanyWithCustomers3 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme3.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers3.customers.sort()
        assertEquals(acmeCompanyWithCustomers3, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme4 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers4 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme4
            })
            .executeSelectOne()
        acmeCompanyWithCustomers4.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers4, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme5 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .orderBy('id')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers5 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme5
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers5, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme6 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers6 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme6.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers6.customers.sort()
        assertEquals(acmeCompanyWithCustomers6, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme7 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .orderBy('result')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers7 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme7.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers7, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme8 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }).union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .select({
                    id: tCustomer.id,
                    firstName: tCustomer.firstName,
                    lastName: tCustomer.lastName
                })
            )
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers8 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme8
            })
            .executeSelectOne()
        acmeCompanyWithCustomers8.customers!.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(acmeCompanyWithCustomers8, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme9 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .select({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            }).union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .select({
                    id: tCustomer.id,
                    firstName: tCustomer.firstName,
                    lastName: tCustomer.lastName
                })
            ).orderBy('id')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers9 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme9
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers9, {
            id: 1,
            name: 'ACME',
            customers: [
                { id: 1, firstName: 'John', lastName: 'Smith' },
                { id: 2, firstName: 'Other', lastName: 'Person' },
                { id: 3, firstName: 'Jane', lastName: 'Doe' }
            ]
        })

        const aggregatedCustomersOfAcme10 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            )
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers10 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme10.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        acmeCompanyWithCustomers10.customers.sort()
        assertEquals(acmeCompanyWithCustomers10, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        const aggregatedCustomersOfAcme11 = connection.subSelectUsing(tCompany).from(tCustomer)
            .where(tCustomer.companyId.equals(tCompany.id))
            .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            .union(
                connection.subSelectUsing(tCompany).from(tCustomer)
                .where(tCustomer.companyId.equals(tCompany.id))
                .selectOneColumn(tCustomer.firstName.concat(' ').concat(tCustomer.lastName))
            ).orderBy('result')
            .forUseAsInlineAggregatedArrayValue()

        const acmeCompanyWithCustomers11 = await connection.selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .select({
                id: tCompany.id,
                name: tCompany.name,
                customers: aggregatedCustomersOfAcme11.useEmptyArrayForNoValue()
            })
            .executeSelectOne()
        assertEquals(acmeCompanyWithCustomers11, {
            id: 1,
            name: 'ACME',
            customers: [
                'Jane Doe',
                'John Smith',
                'Other Person'
            ]
        })

        i = await connection.increment(10)
        assertEquals(i, 11)

        await connection.appendToAllCompaniesName(' Cia.')

        name = await connection
            .selectFrom(tCompany)
            .where(tCompany.id.equals(1))
            .selectOneColumn(tCompany.name)
            .executeSelectOne()
        assertEquals(name, 'ACME Cia.')

        ii = await connection
            .insertInto(tCompany)
            .from(
                connection
                .selectFrom(tCompany)
                .select({
                    name: tCompany.name.concat(' 3')
                })
            )
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(ii, [5, 6, 7])

        const updatedSmithFirstName = await connection.update(tCustomer)
            .set({
                firstName: 'Ron'
            })
            .where(tCustomer.id.equals(1))
            .returningOneColumn(tCustomer.firstName)
            .executeUpdateOne()
        assertEquals(updatedSmithFirstName, 'Ron')

        const oldCustomerValues = tCustomer.oldValues()
        const updatedLastNames = await connection.update(tCustomer)
            .set({
                lastName: 'Customer'
            })
            .where(tCustomer.id.equals(2))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(updatedLastNames, {oldLastName: 'Person', newLastName: 'Customer'})

        const deletedCustomers = await connection.deleteFrom(tCustomer)
            .where(tCustomer.id.greaterOrEquals(2))
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeDeleteMany()
        deletedCustomers.sort((a, b) => {
            return a.id - b.id
        })
        assertEquals(deletedCustomers, [{ id: 2, firstName: 'Other', lastName: 'Customer' }, { id:3, firstName: 'Jane', lastName: 'Doe' } ])

        let insertOneCustomers = await connection
            .insertInto(tCustomer)
            .values({ firstName: 'Other', lastName: 'Person', companyId: 1 })
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertOne()
        assertEquals(insertOneCustomers, { id: 4, firstName: 'Other', lastName: 'Person' })

        const insertMultipleCustomers = await connection
            .insertInto(tCustomer)
            .values([
                { firstName: 'Other 2', lastName: 'Person 2', companyId: 1 },
                { firstName: 'Other 3', lastName: 'Person 3', companyId: 1 }
            ])
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertMany()
        assertEquals(insertMultipleCustomers, [ { id: 5, firstName: 'Other 2', lastName: 'Person 2' }, { id: 6, firstName: 'Other 3', lastName: 'Person 3' }])

        insertOneCustomers = await connection
            .insertInto(tCustomer)
            .from(
                connection
                .selectFrom(tCustomer)
                .select({
                    firstName: tCustomer.firstName.concat(' 2'),
                    lastName: tCustomer.lastName.concat(' 2'),
                    companyId: tCustomer.companyId
                })
                .where(tCustomer.id.equals(1))
            )
            .returning({
                id: tCustomer.id,
                firstName: tCustomer.firstName,
                lastName: tCustomer.lastName
            })
            .executeInsertOne()
        assertEquals(insertOneCustomers, { id: 7, firstName: 'Ron 2', lastName: 'Smith 2' })

        i = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: tCustomer.lastName.concat(' - ').concat(tCompany.name)
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals(1))
            .executeUpdate()
        assertEquals(i, 1)

        i = await connection.deleteFrom(tCustomer)
            .using(tCompany)
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCustomer.id.equals(1))
            .executeDelete()
        assertEquals(i, 1)

        const smithLastNameUpdate = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: 'Smith'
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate, {oldLastName: 'Smith 2', newLastName: 'Smith'})

        const smithLastNameUpdate2 = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: tCustomer.lastName.concat(' - ').concat(tCompany.name)
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate2, {oldLastName: 'Smith', newLastName: 'Smith - ACME Cia.'})

        const smithLastNameUpdate3 = await connection.update(tCustomer)
            .from(tCompany)
            .set({
                lastName: 'Smith'
            })
            .where(tCustomer.companyId.equals(tCompany.id))
            .and(tCompany.name.equals('ACME Cia.'))
            .and(tCustomer.firstName.equals('Ron 2'))
            .returning({
                oldLastName: oldCustomerValues.lastName,
                newLastName: tCustomer.lastName.concat('/').concat(tCompany.name)
            })
            .executeUpdateOne()
        assertEquals(smithLastNameUpdate3, {oldLastName: 'Smith - ACME Cia.', newLastName: 'Smith/ACME Cia.'})

        const companiesIds = await connection.insertInto(tCompany)
            .values([
                {name: 'Top Company'},
                {name: 'Mic Company', parentId: 8},
                {name: 'Low Company', parentId: 9}
            ])
            .returningLastInsertedId()
            .executeInsert()
        assertEquals(companiesIds, [8, 9, 10])

        const parentCompany = tCompany.as('parentCompany')

        // SqlServer doesn't support recursives queries that have outer tables that depends on

        // const parentCompanies = connection.subSelectUsing(tCompany)
        //     .from(parentCompany)
        //     .select({
        //         id: parentCompany.id,
        //         name: parentCompany.name,
        //         parentId: parentCompany.parentId
        //     })
        //     .where(parentCompany.id.equals(tCompany.parentId))
        //     .recursiveUnionAllOn((child) => {
        //         return child.parentId.equals(parentCompany.id)
        //     })
        //     .forUseAsInlineAggregatedArrayValue()

        // const lowCompany = await connection.selectFrom(tCompany)
        //     .select({
        //         id: tCompany.id,
        //         name: tCompany.name,
        //         parentId: tCompany.parentId,
        //         parents: parentCompanies
        //     })
        //     .where(tCompany.id.equals(10))
        //     .executeSelectOne()
        //assertEquals(lowCompany, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        const parentCompanies2 = connection.selectFrom(parentCompany)
            .select({
                id: parentCompany.id,
                name: parentCompany.name,
                parentId: parentCompany.parentId
            })
            .where(parentCompany.id.equals(9))
            .recursiveUnionAllOn((child) => {
                return child.parentId.equals(parentCompany.id)
            })
            .forUseAsInlineAggregatedArrayValue()

        const lowCompany2 = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId,
                parents: parentCompanies2
            })
            .where(tCompany.id.equals(10))
            .executeSelectOne()
        assertEquals(lowCompany2, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        const lowCompany3 = await connection.selectFrom(tCompany)
            .select({
                id: tCompany.id,
                name: tCompany.name,
                parentId: tCompany.parentId
            })
            .where(tCompany.id.equals(10))
            .composeDeletingInternalProperty({
                externalProperty: 'parentId',
                internalProperty: 'startId',
                propertyName: 'parents'
            }).withMany((ids) => {
                return connection.selectFrom(parentCompany)
                    .select({
                        id: parentCompany.id,
                        name: parentCompany.name,
                        parentId: parentCompany.parentId,
                        startId: parentCompany.id
                    })
                    .where(parentCompany.id.in(ids))
                    .recursiveUnionAll((child) => {
                        return connection.selectFrom(parentCompany)
                            .join(child).on(child.parentId.equals(parentCompany.id))
                            .select({
                                id: parentCompany.id,
                                name: parentCompany.name,
                                parentId: parentCompany.parentId,
                                startId: child.startId
                            })
                    })
                    .executeSelectMany()
            })
            .executeSelectOne()
        assertEquals(lowCompany3, { id: 10, name: 'Low Company', parentId: 9, parents: [{ id: 9, name: 'Mic Company', parentId: 8 }, { id: 8, name: 'Top Company' }] })

        i = await connection.insertInto(tRecord).values({
                id: '89BF68FC-7002-11EC-90D6-0242AC120003',
                title: 'My voice memo'
            }).executeInsert()
        assertEquals(i, 1)

        const record = await connection.selectFrom(tRecord)
            .select({
                id: tRecord.id,
                title: tRecord.title
            })
            .where(tRecord.id.asString().contains('7002'))
            .executeSelectOne()
        assertEquals(record, { id: '89BF68FC-7002-11EC-90D6-0242AC120003', title: 'My voice memo' })

        const date = new Date('2022-11-21T19:33:56.123Z')
        const dateValue = connection.const(date, 'localDateTime')
        const dateValidation = await connection
            .selectFromNoTable()
            .select({
                fullYear: dateValue.getFullYear(),
                month: dateValue.getMonth(),
                date: dateValue.getDate(),
                day: dateValue.getDay(),
                hours: dateValue.getHours(),
                minutes: dateValue.getMinutes(),
                second: dateValue.getSeconds(),
                milliseconds: dateValue.getMilliseconds(),
                time: dateValue.getTime(),
                dateValue: dateValue,
            })
            .executeSelectOne()
        assertEquals(dateValidation, {
            fullYear: date.getUTCFullYear(),
            month: date.getUTCMonth(),
            date: date.getUTCDate(),
            day: date.getUTCDay(),
            hours: date.getUTCHours(),
            minutes: date.getUTCMinutes(),
            second: date.getUTCSeconds(),
            milliseconds: date.getUTCMilliseconds(),
            time: date.getTime(),
            dateValue: date,
        })

        await connection.commit()
    } catch(e) {
        await connection.rollback()
        throw e
    }
}

conn.on('connect', function(err) {
    if (err) {
        console.error(err)
        process.exit(1)
    }
    main().then(() => {
        console.log('All ok')
        process.exit(0)
    }).catch((e) => {
        console.error(e)
        process.exit(1)
    })
})

conn.connect()