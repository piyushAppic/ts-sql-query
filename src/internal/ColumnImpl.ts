import type { ITableOrView } from "../utils/ITableOrView"
import type { Column, ColumnWithDefaultValue, ComputedColumn, OptionalColumn, PrimaryKeyAutogeneratedColumn, PrimaryKeyColumn, __ColumnPrivate } from "../utils/Column"
import type { DefaultTypeAdapter, TypeAdapter } from "../TypeAdapter"
import type { SqlBuilder, ToSql } from "../sqlBuilders/SqlBuilder"
import { ValueSource, __getValueSourcePrivate, __OptionalRule } from "../expressions/values"
import { ValueSourceImpl } from "./ValueSourceImpl"
import { CustomBooleanTypeAdapter } from "../TypeAdapter"

export class ColumnImpl extends ValueSourceImpl implements __ColumnPrivate, ToSql {
    __isColumn: true = true
    __name: string
    __table_or_view: ITableOrView<any>
    __isOptional: boolean = false
    __hasDefault: boolean = false
    __isPrimaryKey: boolean = false
    __isAutogeneratedPrimaryKey: boolean = false
    __isComputed = false
    __sequenceName?: string

    constructor(table: ITableOrView<any>, name: string, valueType: string, typeAdapter: TypeAdapter | undefined) {
        super(valueType, typeAdapter)
        this.__name = name
        this.__table_or_view = table
    }

    __toSql(sqlBuilder: SqlBuilder, params: any[]): string {
        return sqlBuilder._appendColumnName(this.__asColumn(), params)
    }

    __toSqlForCondition(sqlBuilder: SqlBuilder, params: any[]): string {
        return sqlBuilder._appendColumnNameForCondition(this.__asColumn(), params)
    }

    __resultIsOptional(_rule: __OptionalRule): boolean {
        return this.__isOptional
    }

    __asColumn(): this & Column {
        return (this as this & Column)
    }

    __asOptionalColumn(): this & OptionalColumn {
        this.__isOptional = true
        return (this as this & OptionalColumn)
    }

    __asColumnWithDefaultValue(): this & ColumnWithDefaultValue {
        this.__hasDefault = true
        return (this as this & ColumnWithDefaultValue)
    }

    __asOptionalColumnWithDefaultValue(): this & OptionalColumn & ColumnWithDefaultValue {
        this.__isOptional = true
        this.__hasDefault = true
        return (this as this & OptionalColumn & ColumnWithDefaultValue)
    }

    __asAutogeneratedPrimaryKey(): this & ColumnWithDefaultValue & PrimaryKeyColumn & PrimaryKeyAutogeneratedColumn {
        this.__hasDefault = true
        this.__isPrimaryKey = true
        this.__isAutogeneratedPrimaryKey = true
        return (this as this & ColumnWithDefaultValue & PrimaryKeyColumn & PrimaryKeyAutogeneratedColumn)
    }

    __asAutogeneratedPrimaryKeyBySequence(sequenceName: string): this & ColumnWithDefaultValue & PrimaryKeyColumn & PrimaryKeyAutogeneratedColumn {
        this.__hasDefault = true
        this.__isPrimaryKey = true
        this.__isAutogeneratedPrimaryKey = true
        this.__sequenceName = sequenceName
        return (this as this & ColumnWithDefaultValue & PrimaryKeyColumn & PrimaryKeyAutogeneratedColumn)
    }

    __asPrimaryKey(): this & PrimaryKeyColumn {
        this.__isPrimaryKey = true
        return (this as this & PrimaryKeyColumn)
    }

    __asComputedColumn(): this & ComputedColumn {
        this.__isComputed = true
        return (this as this & ComputedColumn)
    }

    __asOptionalComputedColumn(): this & OptionalColumn & ComputedColumn {
        this.__isComputed = true
        this.__isOptional = true
        return (this as this & OptionalColumn & ComputedColumn)
    }
}

export function createColumnsFrom(columns: { [property: string]: ValueSource<any, any> }, target: { [property: string]: ValueSource<any, any> }, optionalRule: __OptionalRule, table: ITableOrView<any>, ) {
    for (const property in columns) {
        const column = columns[property]!
        const columnPrivate = __getValueSourcePrivate(column)
        let valueType = columnPrivate.__valueType
        let typeAdapter = columnPrivate.__typeAdapter
        if (typeAdapter instanceof CustomBooleanTypeAdapter) {
            // Avoid treat the column as a custom boolean
            typeAdapter = new ProxyTypeAdapter(typeAdapter)
        }
        const withColumn = new ColumnImpl(table, property, valueType, typeAdapter)
        withColumn.__isOptional = columnPrivate.__isResultOptional(optionalRule)
        target[property] = withColumn
    }
}

export class ProxyTypeAdapter implements TypeAdapter {
    typeAdapter: TypeAdapter

    constructor(typeAdapter: TypeAdapter) {
        this.typeAdapter = typeAdapter
    }

    transformValueFromDB(value: unknown, type: string, next: DefaultTypeAdapter): unknown {
        return this.typeAdapter.transformValueFromDB(value, type, next)
    }

    transformValueToDB(value: unknown, type: string, next: DefaultTypeAdapter): unknown {
        return this.typeAdapter.transformValueToDB(value, type, next)
    }
}