# Spec 211 Release Gate

ACP/Gas City เป็น provider adapters เท่านั้น ไม่ใช่ Job, queue, settlement หรือ
tenant-authority ใหม่:

| Gate | สถานะ | Required evidence |
| --- | --- | --- |
| ACP frame bounds/normalization/permission binding | Pass | focused protocol tests |
| Session origin/config/auth epoch and child custody | Pass | session custody tests |
| Gas City pinned manifest/license/workspace scope | Pass | provider registry tests |
| Certified route + Job/economic boundary | Pass | route resolver and Spec 207 tests |
| Existing Workflow Studio projection contract | Pass | projection tests; browser proof in Spec 209 |
| ACP/Gas City protocol/provider/security matrix | Unverified | installed-provider conformance report |
| Process/store backup/restore and rollback | Unverified | soak, cleanup and restore evidence |

Unknown ACP updates remain observable as unsupported normalized events. They do
not authorize effects, and transport acceptance never becomes economic finality.
