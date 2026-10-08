-- Fresh code issuance remains atomic with NOT EXISTS any active code.
-- A provider-restored cancelled code may coexist with a newer outstanding code;
-- both must remain reserved, rather than releasing an extra purchase allowance.
DROP INDEX IF EXISTS goods_one_active_kind;
CREATE UNIQUE INDEX goods_one_active_custom ON goods_benefit_requests(wallet,kind) WHERE active=1 AND kind='custom';
