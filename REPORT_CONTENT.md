# Project Report Matter - KBIG

## Title

KBIG: Karnataka Business Identity Graph

## Abstract

KBIG is a web-based system designed to unify business records from different government departments under one common identity called the Unified Business Identifier (UBID). Departments such as Shop & Establishment, Factories, and KSPCB may hold separate records for the same business. This creates duplication, inconsistency, and difficulty in tracking business activity. KBIG solves this problem by comparing department records using multiple signals such as GSTIN, PAN, phone number, PIN code, business name, owner name, and address. Based on the confidence score, the system automatically links strong matches, sends uncertain matches to a reviewer, and keeps weak matches separate. The system also provides dashboards, analytics, audit logs, CSV upload, manual record entry, and role-based access.

## Introduction

Government departments often maintain independent datasets for businesses. A single business may appear in multiple departments with small differences in name, address, owner details, or identifiers. Without a common identity layer, it becomes difficult to understand the complete profile of a business, track inspections, detect duplicate records, or identify inactive entities.

KBIG introduces a unified identity graph that connects related records from different departments. The system assigns a UBID to each business and links all matching department records to that UBID. It also gives reviewers a controlled way to approve, reject, defer, or split matches.

## Problem Statement

The main problem is the lack of a unified business identity across departments. Different departments store records independently, causing duplicate entries, inconsistent business information, and incomplete visibility of business activity. A system is required to identify matching records, generate a common business identity, support human review for uncertain cases, and maintain a transparent audit trail.

## Objectives

- To create a unified business identity for records from multiple departments.
- To match business records using multiple identity and similarity signals.
- To automatically link high-confidence matches.
- To send uncertain matches to a reviewer for manual decision-making.
- To allow manual record entry and CSV-based record upload.
- To provide department-wise access and admin-level control.
- To maintain audit logs for transparency and accountability.
- To provide analytics on UBIDs, match outcomes, department coverage, and activity status.

## Scope

The project covers business record ingestion, UBID generation, automated matching, reviewer workflow, audit logging, analytics, event tracking, and department-based views. The current version is suitable as a working prototype or academic project. It uses an in-memory data store and can be extended with a production database in the future.

## Modules

### 1. Role Selection and Authentication

The system supports Admin and department views. Department users can access only their department-specific records. Admin users can access review queues, audit logs, sync operations, threshold tuning, and full-system analytics. The demo admin password is `kbig-admin`.

### 2. Dashboard Module

The dashboard displays UBIDs, business names, status, confidence score, linked departments, sector, and last activity. Users can search and filter by UBID, name, PIN code, status, department, and sector. The dashboard also allows users to open a detailed UBID panel.

### 3. Record Management Module

Users can add records manually by entering department, business name, address, owner details, PAN, GSTIN, phone number, and PIN code. After a record is added, the matching engine recomputes the UBID graph.

### 4. CSV Upload Module

The CSV upload module allows bulk addition of department records. The required fields are business name and address. Optional fields include owner name, PIN code, phone, PAN, GSTIN, and department-specific identifiers. The system validates rows, skips duplicates, and shows an upload summary.

### 5. Matching Engine Module

The matching engine compares records using weighted signals. Exact identifiers such as GSTIN and PAN receive strong importance, while fuzzy signals such as business name, owner name, and address help in partial matching. The engine classifies matches into Auto-Link, Review Needed, or Keep Separate.

### 6. Reviewer Portal

The reviewer portal shows uncertain matches that need manual verification. The reviewer can compare records side by side, view signal scores, and choose one of the decisions: approve merge, reject, split UBID, or defer. These decisions are stored and preserved in future matching runs.

### 7. Analytics Module

The analytics page shows totals for UBIDs, records, linked records, events, unmatched events, and pending reviews. It also displays status classification, match outcomes, confidence bands, department coverage, sector counts, and event type counts. Admin users can tune matching thresholds by department.

### 8. Audit Log Module

The audit log records important system actions such as auto-linking, review queue creation, reviewer decisions, sync operations, threshold updates, CSV uploads, manual records, and event creation. This improves traceability and accountability.

### 9. Sync Module

The sync module tracks department sync operations and source-tagged records. It shows recently synced records by department and refreshes matching after import actions.

### 10. Event and Activity Module

Users can add activity events such as inspection, licence renewal, consent filing, compliance filing, utility consumption, and closure notice. Events help classify business status as Active, Dormant, or Closed.

## System Architecture

KBIG follows a client-server architecture. The frontend is built with React and TypeScript using Vite. It communicates with the backend through REST API endpoints. The backend is built with Express and TypeScript. The backend stores records in memory, runs the matching engine, creates UBIDs, maintains review decisions, stores audit logs, and serves analytics data.

## Matching Methodology

The system uses a multi-signal matching approach. Each pair of records is compared using the following signals:

- GSTIN match
- PAN match
- Phone match
- PIN code match
- Address overlap
- Owner name similarity
- Business name similarity

The matching engine computes a confidence score between 0 and 1. If the score is high, the records are automatically linked. If the score is medium, the pair is sent to the review queue. If the score is low or conflicting, the records are kept separate.

Default thresholds:

| Result | Score Range |
| --- | --- |
| Auto-Link | 0.85 and above |
| Review Needed | 0.55 to 0.84 |
| Keep Separate | Below 0.55 |

## Technologies Used

| Layer | Technology |
| --- | --- |
| Frontend | React, TypeScript, Vite |
| Styling | Tailwind CSS |
| Routing | React Router |
| Backend | Node.js, Express, TypeScript |
| CSV Parsing | PapaParse |
| Icons | Lucide React |
| Testing | Node assert with tsx |

## Advantages

- Reduces duplicate business records.
- Improves department-level data visibility.
- Provides a common UBID for linked records.
- Supports explainable matching through signal scores.
- Includes human review for uncertain matches.
- Maintains transparent audit logs.
- Supports department-specific and admin-level access.
- Provides useful analytics for monitoring coverage and quality.

## Limitations

- The current version uses in-memory storage, so data resets when the server restarts.
- Authentication is demo-based and should be improved for production.
- Sync functionality is a prototype and can be connected to real department systems.
- Production deployment would require a database, environment variables, stronger security, and backup handling.

## Future Enhancements

- Add persistent database storage using PostgreSQL or Supabase.
- Add real department API integrations.
- Add advanced fuzzy matching or machine learning-based entity resolution.
- Add user management with secure login and permissions.
- Add export options for reports and audit logs.
- Add charts with historical trends.
- Add deployment support using cloud hosting.

## Testing

The project includes matching engine tests. The tests verify exact GSTIN matching, graded confidence scoring, duplicate handling, identifier conflicts, missing identifiers, reviewer approval, rejection, split decisions, and review queue limits. Tests can be run using:

```bash
npm test
```

## Conclusion

KBIG provides a practical solution for unifying business records across departments. It combines automated matching with human review to create reliable UBIDs and maintain transparent decision history. The system improves record visibility, reduces duplication, and gives departments a shared identity graph for business monitoring. With database integration and stronger authentication, the project can be extended into a production-ready platform.

