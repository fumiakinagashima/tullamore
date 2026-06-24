-- Remove workflow, approval, and custom entity tables (no longer part of Midleton)
DROP TABLE IF EXISTS `workflow_runs`;
DROP TABLE IF EXISTS `workflows`;
DROP TABLE IF EXISTS `approval_requests`;
DROP TABLE IF EXISTS `entities`;
DROP TABLE IF EXISTS `entity_fields`;
DROP TABLE IF EXISTS `entity_types`;
