import { AnyValueSource, isValueSource, __AggregatedArrayColumns, __getValueSourcePrivate } from "../expressions/values"
import { ITableOrView } from "../utils/ITableOrView"
import { AbstractMySqlMariaDBSqlBuilder } from "./AbstractMySqlMariaBDSqlBuilder"
import { FlatQueryColumns, flattenQueryColumns, hasWithData, InsertData, SelectData, ToSql, WithQueryData } from "./SqlBuilder"

export class MySqlSqlBuilder extends AbstractMySqlMariaDBSqlBuilder {
    mySql: true = true
    _getUuidStrategy(): 'string' | 'binary' {
        return this._connectionConfiguration.uuidStrategy as any || 'binary'
    }
    _isReservedKeyword(word: string): boolean {
        return word.toUpperCase() in reservedWords
    }
    _buildInsertReturning(_query: InsertData, params: any[]): string {
        this._setContainsInsertReturningClause(params, false)
        return ''
    }
    _appendParam(value: any, params: any[], columnType: string): string {
        if (columnType === 'uuid' && this._getUuidStrategy() === 'binary') {
            return 'uuid_to_bin(' + super._appendParam(value, params, columnType) + ')'
        }
        return super._appendParam(value, params, columnType)
    }
    _appendColumnValue(value: AnyValueSource, params: any[], isOutermostQuery: boolean): string {
        if (isOutermostQuery && this._getUuidStrategy() === 'binary') {
            if (__getValueSourcePrivate(value).__valueType === 'uuid') {
                return 'bin_to_uuid(' + this._appendSql(value, params) + ')'
            }
        }
        return this._appendSql(value, params)
    }
    _asString(params: any[], valueSource: ToSql): string {
        // Transform an uuid to string
        if (this._getUuidStrategy() === 'string') {
            // No conversion required
            return this._appendSql(valueSource, params)
        }
        return 'bin_to_uuid(' + this._appendSql(valueSource, params) + ')'
    }
    _appendAggragateArrayColumns(aggregatedArrayColumns: __AggregatedArrayColumns | AnyValueSource, params: any[], _query: SelectData | undefined): string {
        if (isValueSource(aggregatedArrayColumns)) {
            if (__getValueSourcePrivate(aggregatedArrayColumns).__valueType === 'uuid' && this._getUuidStrategy() === 'binary') {
                return 'json_arrayagg(bin_to_uuid(' + this._appendSql(aggregatedArrayColumns, params) + '))'
            }
            return 'json_arrayagg(' + this._appendSql(aggregatedArrayColumns, params) + ')'
        } else {
            const columns: FlatQueryColumns = {}
            flattenQueryColumns(aggregatedArrayColumns, columns, '')

            let result = ''
            for (let prop in columns) {
                if (result) {
                    result += ', '
                }
                result += "'" + prop + "', "
                const column = columns[prop]!
                if (__getValueSourcePrivate(column).__valueType === 'uuid' && this._getUuidStrategy() === 'binary') {
                    result += 'bin_to_uuid(' + this._appendSql(column, params) + ')'
                } else {
                    result += this._appendSql(column, params)
                }
            }

            return 'json_arrayagg(json_object(' + result + '))'
        }
    }
    _appendAggragateArrayWrappedColumns(aggregatedArrayColumns: __AggregatedArrayColumns | AnyValueSource, _params: any[], aggregateId: number): string {
        if (isValueSource(aggregatedArrayColumns)) {
            if (__getValueSourcePrivate(aggregatedArrayColumns).__valueType === 'uuid' && this._getUuidStrategy() === 'binary') {
                return 'json_arrayagg(bin_to_uuid(a_' + aggregateId + '_.result))'
            }
            return 'json_arrayagg(a_' + aggregateId + '_.result)'
        } else {
            const columns: FlatQueryColumns = {}
            flattenQueryColumns(aggregatedArrayColumns, columns, '')

            let result = ''
            for (let prop in columns) {
                if (result) {
                    result += ', '
                }
                result += "'" + prop + "', "
                const column = columns[prop]!
                if (__getValueSourcePrivate(column).__valueType === 'uuid' && this._getUuidStrategy() === 'binary') {
                    result += 'bin_to_uuid(a_' + aggregateId + '_.' + this._escape(prop, true) + ')'
                } else {
                    result += 'a_' + aggregateId + '_.' + this._escape(prop, true)
                }
            }

            return 'json_arrayagg(json_object(' + result + '))'
        }
    }

    _buildWith(withData: WithQueryData, params: any[]): string {
        if (this._connectionConfiguration.compatibilityMode) {
            // No with should be generated
            return ''
        }
        return super._buildWith(withData, params)
    }
    _appendTableOrViewNameForFrom(table: ITableOrView<any>, params: any[]): string {
        if (this._connectionConfiguration.compatibilityMode) {
            // The with clause must be expanded inline when it is required
            if (hasWithData(table)) {
                if (table.__type === 'with') {
                    if (table.__recursive) {
                        throw new Error('Recursive queries are not supported in MySql compatibility mode')
                    }
                    return '(' + this._buildSelect(table.__selectData, params) + ')'
                } else {
                    throw new Error('Values are not supported in MySql compatibility mode')
                }
            }
        }
        return super._appendTableOrViewNameForFrom(table, params)
    }
    _appendTableOrViewNoAliasForFrom(table: ITableOrView<any>, params: any[]): string {
        if (this._connectionConfiguration.compatibilityMode) {
            // The with name must be used as alias
            if (hasWithData(table)) {
                return table.__name
            }
        }

        return super._appendTableOrViewNoAliasForFrom(table, params)
    }
    _setSafeTableOrView(params: any[], tableOrView: ITableOrView<any> | undefined): void {
        if (this._connectionConfiguration.compatibilityMode) {
            // The inline query alias (from the with) always requires explicit name
            if (hasWithData(tableOrView)) {
                super._setSafeTableOrView(params, undefined)
                return
            }
        }
        super._setSafeTableOrView(params, tableOrView)
    }
}

// Source: https://dev.mysql.com/doc/refman/8.0/en/keywords.html (version: 8.0)
const reservedWords: { [word: string]: boolean | undefined } = {
    _FILENAME: true,
    ACCESSIBLE: true,
    ACCOUNT: true,
    ACTION: true,
    ACTIVE: true,
    ADD: true,
    ADMIN: true,
    AFTER: true,
    AGAINST: true,
    AGGREGATE: true,
    ALGORITHM: true,
    ALL: true,
    ALTER: true,
    ALWAYS: true,
    ANALYSE: true,
    ANALYZE: true,
    AND: true,
    ANY: true,
    ARRAY: true,
    AS: true,
    ASC: true,
    ASCII: true,
    ASENSITIVE: true,
    AT: true,
    AUTOEXTEND_SIZE: true,
    AUTO_INCREMENT: true,
    AVG: true,
    AVG_ROW_LENGTH: true,
    BACKUP: true,
    BEFORE: true,
    BEGIN: true,
    BETWEEN: true,
    BIGINT: true,
    BINARY: true,
    BINLOG: true,
    BIT: true,
    BLOB: true,
    BLOCK: true,
    BOOL: true,
    BOOLEAN: true,
    BOTH: true,
    BTREE: true,
    BUCKETS: true,
    BY: true,
    BYTE: true,
    C: true,
    CACHE: true,
    CALL: true,
    CASCADE: true,
    CASCADED: true,
    CASE: true,
    CATALOG_NAME: true,
    CHAIN: true,
    CHANGE: true,
    CHANGED: true,
    CHANNEL: true,
    CHAR: true,
    CHARACTER: true,
    CHARSET: true,
    CHECK: true,
    CHECKSUM: true,
    CIPHER: true,
    CLASS_ORIGIN: true,
    CLIENT: true,
    CLONE: true,
    CLOSE: true,
    COALESCE: true,
    CODE: true,
    COLLATE: true,
    COLLATION: true,
    COLUMN: true,
    COLUMNS: true,
    COLUMN_FORMAT: true,
    COLUMN_NAME: true,
    COMMENT: true,
    COMMIT: true,
    COMMITTED: true,
    COMPACT: true,
    COMPLETION: true,
    COMPONENT: true,
    COMPRESSED: true,
    COMPRESSION: true,
    CONCURRENT: true,
    CONDITION: true,
    CONNECTION: true,
    CONSISTENT: true,
    CONSTRAINT: true,
    CONSTRAINT_CATALOG: true,
    CONSTRAINT_NAME: true,
    CONSTRAINT_SCHEMA: true,
    CONTAINS: true,
    CONTEXT: true,
    CONTINUE: true,
    CONVERT: true,
    CPU: true,
    CREATE: true,
    CROSS: true,
    CUBE: true,
    CUME_DIST: true,
    CURRENT: true,
    CURRENT_DATE: true,
    CURRENT_TIME: true,
    CURRENT_TIMESTAMP: true,
    CURRENT_USER: true,
    CURSOR: true,
    CURSOR_NAME: true,
    DATA: true,
    DATABASE: true,
    DATABASES: true,
    DATAFILE: true,
    DATE: true,
    DATETIME: true,
    DAY: true,
    DAY_HOUR: true,
    DAY_MICROSECOND: true,
    DAY_MINUTE: true,
    DAY_SECOND: true,
    DEALLOCATE: true,
    DEC: true,
    DECIMAL: true,
    DECLARE: true,
    DEFAULT: true,
    DEFAULT_AUTH: true,
    DEFINER: true,
    DEFINITION: true,
    DELAYED: true,
    DELAY_KEY_WRITE: true,
    DELETE: true,
    DENSE_RANK: true,
    DESC: true,
    DESCRIBE: true,
    DESCRIPTION: true,
    DES_KEY_FILE: true,
    DETERMINISTIC: true,
    DIAGNOSTICS: true,
    DIRECTORY: true,
    DISABLE: true,
    DISCARD: true,
    DISK: true,
    DISTINCT: true,
    DISTINCTROW: true,
    DIV: true,
    DO: true,
    DOUBLE: true,
    DROP: true,
    DUAL: true,
    DUMPFILE: true,
    DUPLICATE: true,
    DYNAMIC: true,
    EACH: true,
    ELSE: true,
    ELSEIF: true,
    EMPTY: true,
    ENABLE: true,
    ENCLOSED: true,
    ENCRYPTION: true,
    END: true,
    ENDS: true,
    ENFORCED: true,
    ENGINE: true,
    ENGINES: true,
    ENUM: true,
    ERROR: true,
    ERRORS: true,
    ESCAPE: true,
    ESCAPED: true,
    EVENT: true,
    EVENTS: true,
    EVERY: true,
    EXCEPT: true,
    EXCHANGE: true,
    EXCLUDE: true,
    EXECUTE: true,
    EXISTS: true,
    EXIT: true,
    EXPANSION: true,
    EXPIRE: true,
    EXPLAIN: true,
    EXPORT: true,
    EXTENDED: true,
    EXTENT_SIZE: true,
    FAILED_LOGIN_ATTEMPTS: true,
    FALSE: true,
    FAST: true,
    FAULTS: true,
    FETCH: true,
    FIELDS: true,
    FILE: true,
    FILE_BLOCK_SIZE: true,
    FILTER: true,
    FIRST: true,
    FIRST_VALUE: true,
    FIXED: true,
    FLOAT: true,
    FLOAT4: true,
    FLOAT8: true,
    FLUSH: true,
    FOLLOWING: true,
    FOLLOWS: true,
    FOR: true,
    FORCE: true,
    FOREIGN: true,
    FORMAT: true,
    FOUND: true,
    FROM: true,
    FULL: true,
    FULLTEXT: true,
    FUNCTION: true,
    GENERAL: true,
    GENERATED: true,
    GEOMCOLLECTION: true,
    GEOMETRY: true,
    GEOMETRYCOLLECTION: true,
    GET: true,
    GET_FORMAT: true,
    GET_MASTER_PUBLIC_KEY: true,
    GLOBAL: true,
    GRANT: true,
    GRANTS: true,
    GROUP: true,
    GROUPING: true,
    GROUPS: true,
    GROUP_REPLICATION: true,
    HANDLER: true,
    HASH: true,
    HAVING: true,
    HELP: true,
    HIGH_PRIORITY: true,
    HISTOGRAM: true,
    HISTORY: true,
    HOST: true,
    HOSTS: true,
    HOUR: true,
    HOUR_MICROSECOND: true,
    HOUR_MINUTE: true,
    HOUR_SECOND: true,
    IDENTIFIED: true,
    IF: true,
    IGNORE: true,
    IGNORE_SERVER_IDS: true,
    IMPORT: true,
    IN: true,
    INACTIVE: true,
    INDEX: true,
    INDEXES: true,
    INFILE: true,
    INITIAL_SIZE: true,
    INNER: true,
    INOUT: true,
    INSENSITIVE: true,
    INSERT: true,
    INSERT_METHOD: true,
    INSTALL: true,
    INSTANCE: true,
    INT: true,
    INT1: true,
    INT2: true,
    INT3: true,
    INT4: true,
    INT8: true,
    INTEGER: true,
    INTERVAL: true,
    INTO: true,
    INVISIBLE: true,
    INVOKER: true,
    IO: true,
    IO_AFTER_GTIDS: true,
    IO_BEFORE_GTIDS: true,
    IO_THREAD: true,
    IPC: true,
    IS: true,
    ISOLATION: true,
    ISSUER: true,
    ITERATE: true,
    JOIN: true,
    JSON: true,
    JSON_TABLE: true,
    KEY: true,
    KEYS: true,
    KEY_BLOCK_SIZE: true,
    KILL: true,
    LAG: true,
    LANGUAGE: true,
    LAST: true,
    LAST_VALUE: true,
    LATERAL: true,
    LEAD: true,
    LEADING: true,
    LEAVE: true,
    LEAVES: true,
    LEFT: true,
    LESS: true,
    LEVEL: true,
    LIKE: true,
    LIMIT: true,
    LINEAR: true,
    LINES: true,
    LINESTRING: true,
    LIST: true,
    LOAD: true,
    LOCAL: true,
    LOCALTIME: true,
    LOCALTIMESTAMP: true,
    LOCK: true,
    LOCKED: true,
    LOCKS: true,
    LOGFILE: true,
    LOGS: true,
    LONG: true,
    LONGBLOB: true,
    LONGTEXT: true,
    LOOP: true,
    LOW_PRIORITY: true,
    MASTER: true,
    MASTER_AUTO_POSITION: true,
    MASTER_BIND: true,
    MASTER_COMPRESSION_ALGORITHMS: true,
    MASTER_CONNECT_RETRY: true,
    MASTER_DELAY: true,
    MASTER_HEARTBEAT_PERIOD: true,
    MASTER_HOST: true,
    MASTER_LOG_FILE: true,
    MASTER_LOG_POS: true,
    MASTER_PASSWORD: true,
    MASTER_PORT: true,
    MASTER_PUBLIC_KEY_PATH: true,
    MASTER_RETRY_COUNT: true,
    MASTER_SERVER_ID: true,
    MASTER_SSL: true,
    MASTER_SSL_CA: true,
    MASTER_SSL_CAPATH: true,
    MASTER_SSL_CERT: true,
    MASTER_SSL_CIPHER: true,
    MASTER_SSL_CRL: true,
    MASTER_SSL_CRLPATH: true,
    MASTER_SSL_KEY: true,
    MASTER_SSL_VERIFY_SERVER_CERT: true,
    MASTER_TLS_CIPHERSUITES: true,
    MASTER_TLS_VERSION: true,
    MASTER_USER: true,
    MASTER_ZSTD_COMPRESSION_LEVEL: true,
    MATCH: true,
    MAXVALUE: true,
    MAX_CONNECTIONS_PER_HOUR: true,
    MAX_QUERIES_PER_HOUR: true,
    MAX_ROWS: true,
    MAX_SIZE: true,
    MAX_UPDATES_PER_HOUR: true,
    MAX_USER_CONNECTIONS: true,
    MEDIUM: true,
    MEDIUMBLOB: true,
    MEDIUMINT: true,
    MEDIUMTEXT: true,
    MEMBER: true,
    MEMORY: true,
    MERGE: true,
    MESSAGE_TEXT: true,
    MICROSECOND: true,
    MIDDLEINT: true,
    MIGRATE: true,
    MINUTE: true,
    MINUTE_MICROSECOND: true,
    MINUTE_SECOND: true,
    MIN_ROWS: true,
    MOD: true,
    MODE: true,
    MODIFIES: true,
    MODIFY: true,
    MONTH: true,
    MULTILINESTRING: true,
    MULTIPOINT: true,
    MULTIPOLYGON: true,
    MUTEX: true,
    MYSQL_ERRNO: true,
    NAME: true,
    NAMES: true,
    NATIONAL: true,
    NATURAL: true,
    NCHAR: true,
    NDB: true,
    NDBCLUSTER: true,
    NESTED: true,
    NETWORK_NAMESPACE: true,
    NEVER: true,
    NEW: true,
    NEXT: true,
    NO: true,
    NODEGROUP: true,
    NONE: true,
    NOT: true,
    NOWAIT: true,
    NO_WAIT: true,
    NO_WRITE_TO_BINLOG: true,
    NTH_VALUE: true,
    NTILE: true,
    NULL: true,
    NULLS: true,
    NUMBER: true,
    NUMERIC: true,
    NVARCHAR: true,
    OF: true,
    OFF: true,
    OFFSET: true,
    OJ: true,
    OLD: true,
    ON: true,
    ONE: true,
    ONLY: true,
    OPEN: true,
    OPTIMIZE: true,
    OPTIMIZER_COSTS: true,
    OPTION: true,
    OPTIONAL: true,
    OPTIONALLY: true,
    OPTIONS: true,
    OR: true,
    ORDER: true,
    ORDINALITY: true,
    ORGANIZATION: true,
    OTHERS: true,
    OUT: true,
    OUTER: true,
    OUTFILE: true,
    OVER: true,
    OWNER: true,
    PACK_KEYS: true,
    PAGE: true,
    PARSER: true,
    PARTIAL: true,
    PARTITION: true,
    PARTITIONING: true,
    PARTITIONS: true,
    PASSWORD: true,
    PASSWORD_LOCK_TIME: true,
    PATH: true,
    PERCENT_RANK: true,
    PERSIST: true,
    PERSIST_ONLY: true,
    PHASE: true,
    PLUGIN: true,
    PLUGINS: true,
    PLUGIN_DIR: true,
    POINT: true,
    POLYGON: true,
    PORT: true,
    PRECEDES: true,
    PRECEDING: true,
    PRECISION: true,
    PREPARE: true,
    PRESERVE: true,
    PREV: true,
    PRIMARY: true,
    PRIVILEGES: true,
    PRIVILEGE_CHECKS_USER: true,
    PROCEDURE: true,
    PROCESS: true,
    PROCESSLIST: true,
    PROFILE: true,
    PROFILES: true,
    PROXY: true,
    PURGE: true,
    QUARTER: true,
    QUERY: true,
    QUICK: true,
    RANDOM: true,
    RANGE: true,
    RANK: true,
    READ: true,
    READS: true,
    READ_ONLY: true,
    READ_WRITE: true,
    REAL: true,
    REBUILD: true,
    RECOVER: true,
    RECURSIVE: true,
    REDOFILE: true,
    REDO_BUFFER_SIZE: true,
    REDUNDANT: true,
    REFERENCE: true,
    REFERENCES: true,
    REGEXP: true,
    RELAY: true,
    RELAYLOG: true,
    RELAY_LOG_FILE: true,
    RELAY_LOG_POS: true,
    RELAY_THREAD: true,
    RELEASE: true,
    RELOAD: true,
    REMOTE: true,
    REMOVE: true,
    RENAME: true,
    REORGANIZE: true,
    REPAIR: true,
    REPEAT: true,
    REPEATABLE: true,
    REPLACE: true,
    REPLICATE_DO_DB: true,
    REPLICATE_DO_TABLE: true,
    REPLICATE_IGNORE_DB: true,
    REPLICATE_IGNORE_TABLE: true,
    REPLICATE_REWRITE_DB: true,
    REPLICATE_WILD_DO_TABLE: true,
    REPLICATE_WILD_IGNORE_TABLE: true,
    REPLICATION: true,
    REQUIRE: true,
    REQUIRE_ROW_FORMAT: true,
    RESET: true,
    RESIGNAL: true,
    RESOURCE: true,
    RESPECT: true,
    RESTART: true,
    RESTORE: true,
    RESTRICT: true,
    RESUME: true,
    RETAIN: true,
    RETURN: true,
    RETURNED_SQLSTATE: true,
    RETURNS: true,
    REUSE: true,
    REVERSE: true,
    REVOKE: true,
    RIGHT: true,
    RLIKE: true,
    ROLE: true,
    ROLLBACK: true,
    ROLLUP: true,
    ROTATE: true,
    ROUTINE: true,
    ROW: true,
    ROWS: true,
    ROW_COUNT: true,
    ROW_FORMAT: true,
    ROW_NUMBER: true,
    RTREE: true,
    SAVEPOINT: true,
    SCHEDULE: true,
    SCHEMA: true,
    SCHEMAS: true,
    SCHEMA_NAME: true,
    SECOND: true,
    SECONDARY: true,
    SECONDARY_ENGINE: true,
    SECONDARY_LOAD: true,
    SECONDARY_UNLOAD: true,
    SECOND_MICROSECOND: true,
    SECURITY: true,
    SELECT: true,
    SENSITIVE: true,
    SEPARATOR: true,
    SERIAL: true,
    SERIALIZABLE: true,
    SERVER: true,
    SESSION: true,
    SET: true,
    SHARE: true,
    SHOW: true,
    SHUTDOWN: true,
    SIGNAL: true,
    SIGNED: true,
    SIMPLE: true,
    SKIP: true,
    SLAVE: true,
    SLOW: true,
    SMALLINT: true,
    SNAPSHOT: true,
    SOCKET: true,
    SOME: true,
    SONAME: true,
    SOUNDS: true,
    SOURCE: true,
    SPATIAL: true,
    SPECIFIC: true,
    SQL: true,
    SQLEXCEPTION: true,
    SQLSTATE: true,
    SQLWARNING: true,
    SQL_AFTER_GTIDS: true,
    SQL_AFTER_MTS_GAPS: true,
    SQL_BEFORE_GTIDS: true,
    SQL_BIG_RESULT: true,
    SQL_BUFFER_RESULT: true,
    SQL_CACHE: true,
    SQL_CALC_FOUND_ROWS: true,
    SQL_NO_CACHE: true,
    SQL_SMALL_RESULT: true,
    SQL_THREAD: true,
    SQL_TSI_DAY: true,
    SQL_TSI_HOUR: true,
    SQL_TSI_MINUTE: true,
    SQL_TSI_MONTH: true,
    SQL_TSI_QUARTER: true,
    SQL_TSI_SECOND: true,
    SQL_TSI_WEEK: true,
    SQL_TSI_YEAR: true,
    SRID: true,
    SSL: true,
    STACKED: true,
    START: true,
    STARTING: true,
    STARTS: true,
    STATS_AUTO_RECALC: true,
    STATS_PERSISTENT: true,
    STATS_SAMPLE_PAGES: true,
    STATUS: true,
    STOP: true,
    STORAGE: true,
    STORED: true,
    STRAIGHT_JOIN: true,
    STREAM: true,
    STRING: true,
    SUBCLASS_ORIGIN: true,
    SUBJECT: true,
    SUBPARTITION: true,
    SUBPARTITIONS: true,
    SUPER: true,
    SUSPEND: true,
    SWAPS: true,
    SWITCHES: true,
    SYSTEM: true,
    TABLE: true,
    TABLES: true,
    TABLESPACE: true,
    TABLE_CHECKSUM: true,
    TABLE_NAME: true,
    TEMPORARY: true,
    TEMPTABLE: true,
    TERMINATED: true,
    TEXT: true,
    THAN: true,
    THEN: true,
    THREAD_PRIORITY: true,
    TIES: true,
    TIME: true,
    TIMESTAMP: true,
    TIMESTAMPADD: true,
    TIMESTAMPDIFF: true,
    TINYBLOB: true,
    TINYINT: true,
    TINYTEXT: true,
    TO: true,
    TRAILING: true,
    TRANSACTION: true,
    TRIGGER: true,
    TRIGGERS: true,
    TRUE: true,
    TRUNCATE: true,
    TYPE: true,
    TYPES: true,
    UNBOUNDED: true,
    UNCOMMITTED: true,
    UNDEFINED: true,
    UNDO: true,
    UNDOFILE: true,
    UNDO_BUFFER_SIZE: true,
    UNICODE: true,
    UNINSTALL: true,
    UNION: true,
    UNIQUE: true,
    UNKNOWN: true,
    UNLOCK: true,
    UNSIGNED: true,
    UNTIL: true,
    UPDATE: true,
    UPGRADE: true,
    USAGE: true,
    USE: true,
    USER: true,
    USER_RESOURCES: true,
    USE_FRM: true,
    USING: true,
    UTC_DATE: true,
    UTC_TIME: true,
    UTC_TIMESTAMP: true,
    VALIDATION: true,
    VALUE: true,
    VALUES: true,
    VARBINARY: true,
    VARCHAR: true,
    VARCHARACTER: true,
    VARIABLES: true,
    VARYING: true,
    VCPU: true,
    VIEW: true,
    VIRTUAL: true,
    VISIBLE: true,
    WAIT: true,
    WARNINGS: true,
    WEEK: true,
    WEIGHT_STRING: true,
    WHEN: true,
    WHERE: true,
    WHILE: true,
    WINDOW: true,
    WITH: true,
    WITHOUT: true,
    WORK: true,
    WRAPPER: true,
    WRITE: true,
    X509: true,
    XA: true,
    XID: true,
    XML: true,
    XOR: true,
    YEAR: true,
    YEAR_MONTH: true,
    ZEROFILL: true
}