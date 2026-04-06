# Shift Headcount and Roster Compliance Application

## Purpose

This document is a sample functional specification for recreating the Excel-based shift headcount and roster compliance workbook as a web application.

The current process is based on:

- department-wise baseline manning setup
- daily or weekly roster data pasted by users into a sheet
- automatic comparison of actual rostered staff against baseline need
- variance reporting by department and sub-department

The goal of the application is to replace the manual Excel workflow with a secure, admin-controlled system.

## Current Workbook Logic Identified

The workbook contains these main areas:

- `F&B`, `CUL`, `Rooms`, `Security&Eng`, `Admin`
  - department setup sheets
  - define shifts, positions, sub-departments, and daily manning requirement from `Sun` to `Sat`
- `Baseline`
  - consolidated baseline requirement by main department and sub-department
  - uses formulas such as `SUMIFS` to total each sub-department's daily requirement from the setup sheets
- `Paste RS`
  - user pastes roster data here regularly
  - columns used: `ID`, `Name`, `Department`, `Sun`, `Mon`, `Tue`, `Wed`, `Thu`, `Fri`, `Sat`
- `Compliance Check` and `Auto Compliance`
  - compare baseline need against actual roster presence
  - calculate daily and weekly variance

## Key Business Rules Extracted From Excel

### 1. Shift-level baseline setup

Each department sheet contains rows like:

- `Shift`
- `Position`
- `Dept`
- `Sun` to `Sat`
- `Total HC`

Formula pattern found:

```text
Total HC = SUM(Sun:Sat)
```

Example:

```text
K3 = SUM(D3:J3)
```

### 2. Total manpower required for a sub-department

At the end of each sub-department block, the workbook calculates:

- daily totals for `Sun` to `Sat`
- weekly total
- required manpower based on annual working-day assumptions

Formula pattern found:

```text
Required Headcount = (Weekly Total Shifts * Weeks in Year) / Net Working Days
```

Example from workbook:

```text
= (K7 * B129) / B126
```

Where:

- `K7` = total weekly shifts
- `B129` = weeks in a year
- `B126` = net working days after days off and holidays

### 3. Baseline consolidation

The `Baseline` sheet consolidates sub-department daily requirement using formulas like:

```text
SUMIFS(source_sheet_day_column, source_sheet_department_column, sub_department_name)
```

Example:

```text
=SUMIFS('F&B'!D:D,'F&B'!$C:$C,$E2)
```

This means the application should automatically roll up baseline requirement from all shift rows for each sub-department.

### 4. Roster actual calculation

The `Paste RS` sheet is used to paste roster data.

The workbook counts an employee as working only when the day code is not one of these non-working values:

- blank
- `V`
- `v`
- `UP`
- `WO`
- `AL`
- `UPL`
- `PC`

Formula pattern found in `Auto Compliance`:

```text
Roster Actual =
count of employees where mapped department = baseline sub-department
and roster code is not a non-working code
```

The workbook also uses a department mapping table because roster department names and baseline names are not always identical.

Example mappings found:

- `F&B - Electric Diner` -> `F&B - Electric`
- `F&B - Cecconis` -> `F&B - Ceecconi's`
- `F&B - Banquet OPS` -> `F&B - Banquet`

### 5. Variance calculation

Formula pattern found:

```text
Variance = Roster Actual - Baseline Need
```

Example:

```text
=E3-E2
```

## Proposed Application Scope

### Core objective

Build an application where:

- admin maintains baseline manning by department and sub-department
- admin can add or edit departments, sub-departments, shifts, positions, and budget assumptions
- user pastes daily or weekly roster data into the system
- system automatically calculates actual staff present
- system compares actual vs baseline
- system shows shortage or excess by day, week, department, and sub-department

## User Roles

### Admin

- manage departments
- manage sub-departments
- manage positions
- manage shifts
- maintain baseline manning numbers
- maintain roster code rules
- maintain department name mapping
- edit working-day assumptions used in formulas
- view all reports

### Standard User

- paste daily or weekly roster data
- view compliance results
- export reports if permitted

## Functional Modules

### 1. Master Data Management

Admin should be able to maintain:

- main department
- sub-department
- shift name and time
- position
- baseline daily requirement for each shift
- budgeted headcount
- roster department mapping
- working and non-working roster codes

### 2. Baseline Manning Setup

The system should allow creation of records like:

| Main Department | Sub-Department | Shift | Position | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F&B | F&B - Electric | Opening Shift (11:00 AM) | Waiter | 1 | 1 | 1 | 1 | 1 | 1 | 1 |

The system should automatically calculate:

- row weekly total
- sub-department daily totals
- sub-department weekly total
- required manpower / FTE

### 3. Daily or Weekly Roster Paste

Users should be able to paste roster data in a table with columns:

| Employee ID | Employee Name | Department | Sun | Mon | Tue | Wed | Thu | Fri | Sat |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

Recommended behavior:

- allow paste from Excel directly
- validate required columns
- validate duplicate employee IDs
- validate unrecognized department names
- allow preview before final save
- tag each upload by date or week

### 4. Department Name Mapping

Because roster department names may differ from baseline names, the app must support a mapping table:

| Roster Department Name | Baseline Department Name |
| --- | --- |
| F&B - Cecconis | F&B - Ceecconi's |
| F&B - Banquet OPS | F&B - Banquet |

This mapping is mandatory for accurate compliance calculation.

Additional example:

| Roster Department Name | Baseline Department Name |
| --- | --- |
| Concierge / Conceagre | Front Office |

This is important for cases where the baseline uses one operational name and the pasted roster uses another name or misspelled variation.

Best practice for the application:

- keep one master baseline name as the system standard
- allow admin to map multiple Paste RS department name variations to that one standard name
- apply the mapping automatically during roster validation and compliance calculation
- allow admin to correct or replace old mappings without changing historical uploads

### 5. Compliance Dashboard

For each department and sub-department, show:

- baseline need
- roster actual
- variance
- weekly total
- shortage / overstaffing indicators

Suggested output layout:

| Department | Sub-Department | Metric | Sun | Mon | Tue | Wed | Thu | Fri | Sat | Weekly Total |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F&B | F&B - Electric | Baseline Need | 4 | 5 | 5 | 5 | 5 | 5 | 5 | 34 |
| F&B | F&B - Electric | Roster Actual | 5 | 5 | 4 | 5 | 6 | 6 | 5 | 36 |
| F&B | F&B - Electric | Variance | 1 | 0 | -1 | 0 | 1 | 1 | 0 | 2 |

## Suggested Data Model

### Department

- `id`
- `name`
- `code`
- `is_active`

### SubDepartment

- `id`
- `department_id`
- `name`
- `display_name`
- `budget_headcount`
- `is_active`

### ShiftTemplate

- `id`
- `department_id`
- `sub_department_id`
- `shift_name`
- `start_time`
- `end_time`
- `position_name`
- `sun_required`
- `mon_required`
- `tue_required`
- `wed_required`
- `thu_required`
- `fri_required`
- `sat_required`

### RosterUpload

- `id`
- `upload_date`
- `week_start_date`
- `uploaded_by`
- `status`

### RosterEntry

- `id`
- `roster_upload_id`
- `employee_id`
- `employee_name`
- `roster_department_name`
- `mapped_sub_department_id`
- `sun_code`
- `mon_code`
- `tue_code`
- `wed_code`
- `thu_code`
- `fri_code`
- `sat_code`

### DepartmentMapping

- `id`
- `roster_department_name`
- `baseline_department_name`
- `is_active`

### RosterCodeRule

- `id`
- `code`
- `counts_as_working`

## Calculation Logic for the Application

### Baseline daily need

For each sub-department and day:

```text
Baseline Need(day) = sum of all shift requirement rows for that sub-department and day
```

### Weekly baseline total

```text
Weekly Baseline Total = Sun + Mon + Tue + Wed + Thu + Fri + Sat
```

### Required FTE / manpower

```text
Required FTE = (Weekly Baseline Total * Weeks in Year) / Net Working Days
```

Suggested configurable values:

- `weeks_in_year`
- `annual_days`
- `weekly_days_off`
- `public_holidays`
- `net_working_days`

### Actual roster count

For each sub-department and day:

```text
Roster Actual(day) =
count of roster entries
where mapped_sub_department = current sub-department
and roster_code not in non-working codes
```

### Variance

```text
Variance(day) = Roster Actual(day) - Baseline Need(day)
Weekly Variance = sum of daily variances
```

## Minimum Screens

### 1. Login

- role-based access

### 2. Dashboard

- summary by department
- shortages
- overstaffing
- upload status

### 3. Baseline Setup

- maintain shifts and daily manning
- add department
- add sub-department
- edit budget assumptions

### 4. Roster Upload / Paste Screen

- paste grid
- import validation
- save upload

### 5. Compliance Report

- by department
- by sub-department
- by day
- by week
- export to Excel / PDF

### 6. Settings

- department mapping
- non-working codes
- formula assumptions
- alias and mismatch management for baseline vs Paste RS department names

## Validation Rules

- only admin can create or edit department structure
- only admin can change baseline manning and formula assumptions
- pasted roster must contain valid department name or a configured mapping
- if Paste RS contains a department name that does not exactly match baseline, the system should suggest an existing mapped name or allow admin to map it
- duplicate employee records in the same upload should be flagged
- invalid roster codes should be flagged
- upload must be date-stamped and auditable

## Recommended Enhancements Beyond Excel

- audit trail for all master data changes
- upload history
- approval workflow for baseline changes
- color-coded shortages and excess
- month-wise trend reporting
- email notification for major shortages
- auto-suggestion of likely department matches for spelling mistakes such as `Conceagre` vs `Concierge`
- API-based import instead of manual paste in future

## Suggested MVP Flow

1. Admin creates departments and sub-departments.
2. Admin configures baseline shifts and daily manning.
3. Admin configures roster code rules and department mapping.
4. User pastes daily or weekly roster data.
5. System validates and saves the upload.
6. System calculates baseline need, actual roster, and variance.
7. User views compliance dashboard and exports report.

## Important Assumptions

- This specification is inferred from the attached workbook structure and formulas.
- The workbook appears to work on a weekly pattern (`Sun` to `Sat`) even if roster paste happens daily.
- The application can support daily paste while still storing and reporting by week.
- Department mapping is essential because source roster names are inconsistent.
- The best approach is to keep baseline naming as the master reference and let admin maintain an alias mapping for Paste RS names, spelling mistakes, and alternative operational labels.

## Conclusion

This application should replace the Excel workbook with a controlled process where baseline manpower planning, roster paste, and compliance calculations are managed in one system. The core app logic should preserve the existing Excel formulas while making the process easier to maintain, safer for admins, and faster for daily operational use.
