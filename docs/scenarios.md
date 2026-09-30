<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Scenarios

Twelve real situations from the user's work as a manager, written as acceptance examples in the language of [CONTEXT.md](../CONTEXT.md) and consistent with the ADRs in [docs/adr](adr/). Each scenario quotes the original description, shows one example run with concrete 2026 dates, lists testable acceptance criteria, and names the steps that deliberately stay outside ASYS.

People, company names and email addresses in the examples are invented.

## S1. Monthly 1:1 phone call with an employee

> A monthly phone check-in with an employee

**Shape:** A Series of Occasions made from the 'Monthly 1:1 phone call' Playbook (Fixed recurrence, first Tuesday of the month) with its 'Employee' Role bound to one Person, because the call and its Prep repeat on a calendar schedule for that one employee.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Monthly 1:1 phone call', Role 'Employee'.
- Series: Fixed recurrence, monthly, first Tuesday of the month; Role 'Employee' filled by Person Sanne de Vries (email address set). The Series remembers this, so every Occurrence fills the Role without re-picking her.
- October Occurrence: Occasion 'Monthly 1:1: Sanne de Vries', a day, 2026-10-06, Area People Ops (Active hours weekdays 8 to 18, default Privacy Private).
- Activity 'Phone call: Sanne de Vries', Anchor the Occasion, Offset 'on the start day at 10:00, 30 min', giving 2026-10-06 10:00-10:30. Busy, not Workable, needs Voice Closed door, Privacy Private, Guest: Sanne de Vries (the Person filling Role 'Employee'); ASYS is the organiser and sends her the Invite.
- Prep Task 'Prepare talking points', Anchor the call Activity (chained to the Occasion), Offset 'Available from 1 Working day before its start at 09:00, Due end of that day', giving Available from 2026-10-05 09:00, Due 2026-10-05. Estimate 10 min, Importance Important, Privacy Private (mirrored to Google Tasks, title only).
- One Series per employee: only Tasks can be copied per member of a Group, so each employee's call has its own Series.
- Notes on the Activity hold what was discussed; anything agreed on the call becomes a Follow-up Task added by hand.
- No Delegation and no blocked-by links.

**Acceptance criteria:**
1. Moving October's call from 6 October 10:00 to 8 October 10:00 moves its Prep to Available from 7 October 09:00; the Series and November's Occurrence on 3 November are unchanged, and a Prep already Done keeps its date.
2. Skipping the October Occurrence (Sanne on leave) marks it and its open Prep Skipped and its call Cancelled, and Google sends Sanne the cancellation; the Series is unchanged and November's Occurrence is still created for 3 November with Sanne in the Role.
3. Sanne receives Google's Invite for each call when its Google event is written, and Google's normal update whenever a call is moved.
4. Because the call has a Guest, its Privacy can be set to Visible or Private but never to Hidden.
5. Each call is written to Google Calendar as its own event, never as a Google recurring event, on a rolling 8-week horizon: on 28 September 2026 the 6 October and 3 November calls exist in Google and the 1 December call does not yet.
6. Sanne de Vries's Person page lists 'Monthly 1:1 phone call' among the recurring Series bound to her; deleting or Anonymising her while that Series is active raises a Review item.
7. With a Series 'Train to Utrecht' (weekdays 07:52-08:44, Workable, Voice Silent), dragging the 1 December call to 08:00 shows an inline Voice clash warning and still moves it; if an Occurrence created by the Series overlapped the ride instead, ASYS would raise one Review item for that pair and move nothing.

## S2. Team lunch session

> A lunch session at a set datetime, requiring creating a calendar event for all employees, a slack message a few days beforehand to gauge attendees and delegate ordering lunch on the day itself at 10:00 at the latest.

**Shape:** The 'Team lunch' Playbook creates a one-off Occasion each time a lunch is scheduled, since these lunches follow no calendar schedule; the Occasion carries the lunch Activity, with the whole company as Guest, and two Prep Tasks, one of them Delegated.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Team lunch', Role 'Lunch orderer', filled by Person Iris de Boer when the Occasion is created.
- Group 'All employees': Google Group all@company.com, no extra Persons, excluding Pieter Smit (a director on that address who is not an employee).
- Occasion 'Team lunch, 16 Oct 2026', a moment, 2026-10-16 12:30, Area Team (Active hours weekdays 8 to 18, default Privacy Private).
- Activity 'Team lunch', Anchor the Occasion, Offset 'at the start, 60 min', giving 2026-10-16 12:30-13:30. Busy, not Workable, Privacy Visible (opted in, so colleagues see the title), Guest: Group 'All employees', invited through all@company.com as a whole; ASYS is the organiser. The canteen is noted in its Notes, since Place applies only to Tasks.
- Prep Task 'Send Slack message to gauge attendees', Anchor the Occasion, Offset 'Available from 3 Working days before the start at 09:00, Due 2 Working days before the start', giving Available from 2026-10-13 09:00, Due 2026-10-14. Estimate 10 min, Importance not Important, Privacy Private; Notes hold the draft message and, later, the manager's tally of replies.
- Prep Task 'Order lunch', Anchor the Occasion, Offset 'Available from the day before at 08:00, Due on the start day at 10:00', giving Available from 2026-10-15 08:00, Due 2026-10-16 10:00. Estimate 15 min, Importance Important, Privacy Private, blocked by 'Send Slack message to gauge attendees'.
- Delegation: 'Order lunch' is Delegated to Role 'Lunch orderer' (Iris de Boer); the Playbook item sets its Check-in to 'same day at 09:30' relative to its Due, giving a Check-in on 2026-10-16 09:30, Privacy Private.

**Acceptance criteria:**
1. The lunch's Guest is Group 'All employees', invited through all@company.com as a whole: someone who joins all@company.com after the Invite went out is included, and Pieter Smit, though excluded from the Group, is invited too, because a Group's exclusions never apply to Guests.
2. Because the lunch has a Guest, its Privacy can be Visible or Private but never Hidden.
3. Moving the Occasion from Friday 16 to Friday 23 October moves the lunch to 23 October 12:30, 'Send Slack message to gauge attendees' to Available from 20 October 09:00 and Due 21 October, 'Order lunch' to Due 23 October 10:00 and its Check-in to 23 October 09:30; Google sends its normal update to all@company.com.
4. 'Order lunch' is Blocked while 'Send Slack message to gauge attendees' is Open or Delegated, even after 15 October 08:00 has passed.
5. 'Order lunch' gets its Check-in on 16 October at 09:30, not at the default one day before its Due.
6. While 'Order lunch' is Delegated it is not mirrored to Google Tasks; its Check-in is, title only.
7. If the 09:30 Check-in closes with the Outcome Not yet, the next Check-in defaults to Monday 19 October, the next Working day, and 'Order lunch' becomes Overdue after 10:00 on 16 October.
8. Closing the Check-in with Done marks 'Order lunch' Done and ends the Delegation; closing it with Take back returns 'Order lunch' to the User as Open.

**Manual by design:**
- Sending the Slack message: a manual Prep Task with the draft text in its Notes; the manager sends it.
- Gauging attendees: ASYS records no replies or headcount for the lunch; the tally is free text the manager writes into the same Notes.
- Placing the order with the caterer: done by Iris outside ASYS; ASYS tracks only the Delegated Task and its Check-in.

## S3. New employee onboarding

> A new employee starts on the 1st of september and needs accounts, access tags and equipment ordered beforehand. On the starting day itself a welcome lunch and picture moment, linkedin post, administrative tool explanation. Then a few check-ins in increasing intervals.

**Shape:** The 'Employee onboarding' Playbook creates a one-off Occasion on the start date, since a new hire happens once; the pre-boarding Prep, the day-of Activities and the later 1:1 calls are all anchored to it, directly or through the walkthrough Activity.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Employee onboarding', Roles 'New employee' (Person Fatima de Groot, email address set) and 'Office manager' (Person Marieke), filled when the Occasion is created.
- Occasion 'Onboarding: Fatima de Groot', a day, 2026-09-01, Area People Ops (Active hours weekdays 8 to 18, default Privacy Private).
- Prep Task 'Order laptop and equipment', Anchor the Occasion, Offset '14 days before the start', Due 2026-08-18. Estimate 30 min, Importance Important, Delegated to Role 'Office manager' (Marieke); Check-in at the default one day before its Due, 2026-08-17.
- Prep Task 'Request office access badge', Anchor the Occasion, Offset '7 days before the start', Due 2026-08-25. Estimate 30 min, Importance Important.
- Prep Task 'Set up IT accounts for Fatima', Anchor the 'Administrative tools walkthrough' Activity (chained to the Occasion), Offset '3 Working days before its start', Due 2026-08-27. Estimate 1 h, Importance Important, blocked by both 'Order laptop and equipment' and 'Request office access badge'.
- Activity 'Welcome lunch', Anchor the Occasion, Offset 'on the start day at 12:00, 1 h', giving 2026-09-01 12:00-13:00. Busy, not Workable, Privacy Visible, Guests: Group 'All employees' (all@company.com, invited as a whole) and Fatima de Groot; ASYS is the organiser.
- Activity 'Picture moment', Offset 'on the start day at 13:00, 15 min', giving 13:00-13:15. Busy, not Workable, Privacy Private, Guest Fatima de Groot.
- Activity 'Administrative tools walkthrough', Offset 'on the start day at 14:00, 1 h', giving 14:00-15:00. Busy, not Workable, Privacy Private, Guest Fatima de Groot.
- Task 'Publish LinkedIn welcome post', Anchor the Occasion, Offset 'on the start day', Due 2026-09-01. Estimate 15 min, Importance not Important.
- Activities 'Call with Fatima after 1 week', 'after 1 month' and 'after 3 months', Anchor the Occasion, Offsets '7 days after the start at 10:00, 15 min', '1 month after the start at 10:00, 15 min' and '3 months after the start at 10:00, 30 min', giving 2026-09-08, 2026-10-01 and 2026-12-01. Busy, not Workable, needs Voice Closed door, Privacy Private, Guest Fatima de Groot. Three separate Offsets rather than a Series, because the intervals differ.

**Acceptance criteria:**
1. Moving the Occasion from 1 to 8 September moves every open item anchored to it, directly or through the walkthrough, each recalculated from its own Offset (laptop Due 25 August, IT accounts Due 3 September, calls on 15 September, 8 October and 8 December); a Task already Done keeps its date.
2. Moving only the walkthrough from 1 September 14:00 to 2 September 14:00 moves 'Set up IT accounts for Fatima' from Due 27 August to Due 28 August and moves nothing else.
3. 'Set up IT accounts for Fatima' is Blocked while either 'Order laptop and equipment' or 'Request office access badge' is Open or Delegated.
4. The Welcome lunch invites Group 'All employees' through all@company.com, so someone who joins that address before 1 September is included; because it has Guests its Privacy can be Visible or Private but never Hidden.
5. 'Order laptop and equipment' gets a Check-in on 17 August; while the Task is Delegated it is not mirrored to Google Tasks, and its Check-in is, title only.
6. If that Check-in closes with Not yet on Monday 17 August, the next Check-in defaults to Tuesday 18 August, the next Working day.
7. If 'Set up IT accounts for Fatima' is still Open when the walkthrough is about to start, ASYS gives the Reminder for an Activity about to start with open Prep.
8. Once 1 September has passed and none of the Occasion's Tasks is Open, the Occasion is Past, even though the October and December calls still lie ahead.
9. Moving the Occasion so that one of the three calls overlaps a Silent Workable Activity, such as a train ride, raises one Review item for that pair and moves nothing else.

**Manual by design:**
- Ordering the laptop and equipment: done by Marieke outside ASYS; ASYS tracks only the Delegated Task and its Check-in.
- Requesting the access badge from facilities: a manual Task; ASYS tracks only that it was done.
- Publishing the LinkedIn post: a manual Task whose Notes hold the draft text.

## S4. Employee leaves

> An employee leaves the company. This needs an exit-interview beforehand. Check that they have given official notice. Collection of access tags, equipment and other company-owned stuff at the very latest moment. A present and farewell lunch some time before leaving. Afterwards accounts need to be disabled and after a longer time deleted.

**Shape:** The 'Employee offboarding' Playbook creates a one-off Occasion on the agreed last working day, because offboarding happens once per employee; the notice check is a standalone Task done first, since the date is only certain once notice is confirmed.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Standalone Task 'Confirm official notice from Tom Bakker', no Anchor, Due 2026-09-04, Area People Ops, Importance Important, Privacy Hidden (not mirrored); Notes hold a link to the HR system. Done on 2026-09-03, after which the User creates the Occasion.
- Playbook 'Employee offboarding', Roles 'Leaving employee' (Tom Bakker, email address set), 'Office admin' (Marieke) and 'IT admin' (Devon).
- Occasion 'Offboarding: Tom Bakker', a day, 2026-10-15, Area People Ops (Active hours weekdays 8 to 18, default Privacy Private).
- Activity 'Exit interview with Tom Bakker', Anchor the Occasion, Offset '7 Working days before the start at 14:00, 45 min', giving 2026-10-06 14:00-14:45. Busy, not Workable, Privacy Private, Guest Tom Bakker; ASYS is the organiser.
- Prep Task 'Prepare exit interview questions', Anchor the Exit interview, Offset '1 Working day before its start, Due 12:00', giving Due 2026-10-05 12:00. Estimate 20 min.
- Prep Task 'Buy leaving present', Anchor the Occasion, Offset '10 days before the start', Due 2026-10-05. Estimate 30 min, Importance Important, Delegated to Role 'Office admin' (Marieke); Check-in timing '3 Working days before its Due at 09:00', giving 2026-09-30 09:00.
- Activity 'Farewell lunch', Anchor the Occasion, Offset '3 days before the start at 12:00, 1 h 30', giving 2026-10-12 12:00-13:30. Busy, not Workable, Privacy Private, Guest: Group 'Consultancy team' (team@company.com, invited as a whole, Tom among its members).
- Task 'Collect access tags, equipment and company property', Anchor the Occasion, Offset 'on the start day, Due 17:00', giving Due 2026-10-15 17:00. Estimate 20 min, Importance Important, Delegated to Role 'IT admin' (Devon); Check-in timing 'same day at 15:30'.
- Follow-up 'Disable accounts', Anchor the Occasion, Offset '1 Working day after the start', Due 2026-10-16, Area IT, blocked by 'Collect access tags, equipment and company property'.
- Follow-up 'Delete accounts', Anchor the Occasion, Offset '90 days after the start', Due 2027-01-13, Area IT, blocked by 'Disable accounts'.
- Prep Task 'End Tom Bakker's recurring Series', Anchor the Occasion, Offset '1 Working day before the start', Due 2026-10-14; the User ends by hand each Series his Person page lists, such as his monthly 1:1.

**Acceptance criteria:**
1. Completing 'Confirm official notice from Tom Bakker' creates nothing by itself; the Occasion and its items exist only once the User creates the Occasion from the Playbook.
2. Moving the Occasion from 15 to 22 October moves the Exit interview to 13 October 14:00, its Prep to Due 12 October 12:00, 'Buy leaving present' to Due 12 October, the Farewell lunch to 19 October 12:00, the collection to Due 22 October 17:00, 'Disable accounts' to 23 October and 'Delete accounts' to 20 January 2027; a Task already Done keeps its date.
3. The Exit interview and the Farewell lunch have Guests, so each can be Visible or Private but never Hidden, and moving either sends Google's normal update to its Guests.
4. A colleague who joins team@company.com after the Farewell lunch Invite went out is still included, because the Group is invited through its address as a whole.
5. 'Disable accounts' is Blocked while the collection Task is Open or Delegated, and 'Delete accounts' is Blocked while 'Disable accounts' is Open or Delegated, even after 13 January 2027 has passed.
6. 'Buy leaving present' gets its Check-in on 30 September at 09:00 and the collection Task on 15 October at 15:30; while Delegated neither Task is mirrored to Google Tasks, and both Check-ins are, title only.
7. Tom Bakker's Person page lists the recurring Series bound to him; deleting or Anonymising him while one of them is still active raises a Review item.
8. The Occasion stays Upcoming after 15 October for as long as 'Delete accounts' is Open.

**Manual by design:**
- Checking that official notice was given: a manual Task with a link to the HR system in its Notes, since reading HR data is out of scope.
- Buying the present: done by Marieke outside ASYS; the Delegated Task only tracks it.
- Collecting the property and disabling and deleting the accounts: physical and IT-system steps outside ASYS; the Tasks only track that they were done.

## S5. Month-end hours registration

> At the end of each month, a slack message needs to go out to call on everyone to register their hours correctly, then on the very last moment that month a check that everyone has done it correctly with potential re-checks, follow-up messages or calls needing to go out. After everyone is done, an OK to the billing team.

**Shape:** A Series of Occasions made from the 'Month-end hours registration' Playbook (Fixed recurrence, last Working day of the month), with its 'Employee' Role filled by a Group so that each Occurrence gives every current employee their own Delegated Task.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Month-end hours registration', Role 'Employee'.
- Group 'All employees': Google Group all@company.com, no extra Persons, excluding Pieter Smit (a director on that address who does not register hours).
- Series 'Month-end hours': Fixed recurrence, monthly, last Working day of the month, Area Operations (Active hours weekdays 8 to 18, default Privacy Private); Role 'Employee' filled by Group 'All employees', which the Series remembers for every Occurrence.
- October Occurrence: Occasion 'Hours close October 2026', a day, 2026-10-30 (31 October is a Saturday), created on 2026-09-04, 8 weeks ahead.
- Prep Task 'Post hours reminder', Anchor the Occasion, Offset 'Available from 3 Working days before the start at 09:00, Due end of that day', giving 2026-10-27; Notes hold the Slack draft.
- Playbook Task 'Register your hours', marked per member for Role 'Employee' and Delegated to that Role, Offset 'Available from the start day at 09:00, Due 16:00', Check-in timing 'same day at 15:00'. When it becomes Available on 2026-10-30 at 09:00, ASYS reads all@company.com's current members read-only, matches them to Persons by email, removes Pieter Smit, and raises a Review item for each member without a Person; each matched Person gets one copy, Delegated to them, Due 2026-10-30 16:00, Check-in 2026-10-30 15:00.
- Task 'OK to billing team', Anchor the Occasion, Offset 'on the start day, Due 17:30', giving Due 2026-10-30 17:30, blocked by every 'Register your hours' copy of this Occurrence, and Blocked until those copies exist.

**Acceptance criteria:**
1. The October 2026 Occasion falls on Friday 30 October, the last Working day of the month, not on Saturday 31 October.
2. Each current member of all@company.com who matches a Person gets one 'Register your hours' copy, Pieter Smit gets none, and a member without a matching Person raises a Review item; ASYS never creates a Person.
3. Membership is fixed when the copies are made: someone added to all@company.com on 29 October gets an October copy, while someone added on 30 October after 09:00 gets none for October and gets one in November.
4. If all@company.com's members cannot be read, the copies go to the Persons kept by hand as the Group's members.
5. While a copy is Delegated it is not mirrored to Google Tasks; its Check-in at 15:00 on 30 October is, title only.
6. 'OK to billing team' is Blocked before the copies are made on 30 October at 09:00 and while any of them is Open or Delegated, and is no longer Blocked once none is (for example all Done, or a leaver's copy Dropped).
7. If a Check-in closes with Not yet on Friday 30 October, that employee's next Check-in defaults to Monday 2 November, the next Working day; 'OK to billing team' becomes Overdue after 17:30 on 30 October while it is still Blocked.
8. Moving the October Occasion from 30 to 29 October moves 'Post hours reminder' to 26 October, 'Register your hours' (and any open copy already made) to Available from 29 October 09:00 and Due 16:00, and 'OK to billing team' to Due 29 October 17:30; a copy already Done keeps its date.
9. Closing a Check-in with Not yet asks whether the next one is by message or by phone: choosing by phone makes Monday's Check-in need Out loud, so on a Silent train ride on 2 November the Picker leaves it out and lists it under Not here, above the ranking because it is urgent; by message it needs no Voice and is suggested on the train.

**Manual by design:**
- Posting the Slack reminder: a manual Task with the draft text in its Notes.
- Closing each Check-in: the User checks the hours system by hand, since reading hours data is out of scope.
- Chasing a straggler by Slack or phone after Not yet: done outside ASYS, with any draft text in the Check-in's Notes; ASYS only records whether the next Check-in is by message or by phone, which sets its Voice.
- Sending the OK to billing: a manual Task; the message itself goes out outside ASYS.

## S6. Candidate interview

> A candidate arrives for an interview. Ensure a room is booked, the CV is printed and create questions for the person. Afterwards the scorecard needs to be filled in and feedback needs to be given to recruitment.

**Shape:** The 'Candidate interview' Playbook applied to the Activity made from the recruiter's Invite, because the interview's time and Guests already exist in that Invite, so the Playbook only adds Prep and Follow-ups anchored to it and fills its Roles from the Invite's Guests.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Recruiter Alex Renkema sends an Invite for 2026-10-07 14:00-15:00 to the User and candidate Priya Shah; ASYS imports it as Activity 'Interview: Priya Shah', Busy, not Workable, Area Recruitment (Active hours weekdays 8 to 18, default Privacy Private). It stays read-only, since Alex is its organiser.
- Playbook 'Candidate interview', Roles 'Candidate' and 'Recruiter', applied to that Activity: matching the Invite's Guests' emails to Persons fills 'Candidate' with Priya Shah and 'Recruiter' with Alex Renkema.
- Prep Task 'Book interview room', Anchor the Activity, Offset '3 Working days before its start', Due 2026-10-02. Place Office, Estimate 10 min, Importance Important.
- Prep Task 'Print CV', Anchor the Activity, Offset 'Available from the start day at 08:00, Due 13:30', giving 2026-10-07 08:00-13:30. Place Office, Estimate 5 min.
- Prep Task 'Prepare interview questions', Anchor the Activity, Offset '1 day before its start, Due 17:00', giving Due 2026-10-06 17:00. Estimate 30 min, Importance Important, linked to Priya Shah; Notes hold the questions.
- Follow-up 'Fill in scorecard', Anchor the Activity, Offset 'Available from its end, Due same day 18:00', giving 2026-10-07 15:00-18:00. Estimate 15 min, Importance Important; Notes hold the scorecard.
- Follow-up 'Give feedback to recruitment', Anchor the Activity, Offset 'Available from the next Working day at 08:00, Due 12:00', giving 2026-10-08 08:00-12:00. Estimate 10 min, linked to Alex Renkema, blocked by 'Fill in scorecard'.
- All five Tasks are Privacy Private.

**Acceptance criteria:**
1. ASYS offers no change to the interview's time, duration or Guests, and sends no Invite or update for it.
2. Applying the Playbook fills 'Candidate' with Priya Shah and 'Recruiter' with Alex Renkema by email; a Guest whose email matches no Person fills no Role, and ASYS creates no Person for them.
3. When Alex moves the Invite to Friday 9 October 14:00, the Tasks recalculate: 'Book interview room' Due 6 October, 'Print CV' 9 October 08:00-13:30, 'Prepare interview questions' Due 8 October 17:00, 'Fill in scorecard' 9 October 15:00-18:00, 'Give feedback to recruitment' Monday 12 October 08:00-12:00.
4. If Alex cancels the Invite while 'Book interview room' or 'Prepare interview questions' is Open, ASYS raises a Review item for that open Prep.
5. 'Give feedback to recruitment' is Blocked while 'Fill in scorecard' is Open or Delegated.
6. If 'Print CV' is still Open when the interview is about to start, ASYS gives the Reminder for an Activity about to start with open Prep.
7. Because the five Tasks are Private, Google Tasks shows only their titles; the questions and the scorecard in their Notes never reach Google.
8. If none of the Invite's guests matches Role 'Recruiter' (for example because Alex has no Person yet), that Role stays empty, a Review item asks the User to fill it, and all five Tasks are still created.

**Manual by design:**
- Booking the actual room in the office's room-booking system: done outside ASYS; 'Book interview room' only tracks it, since Place is a location, not a bookable resource.
- Giving the feedback to recruitment by message or call: done outside ASYS; the Task only tracks it.

## S7. Birth leave

> An employee is on leave for the birth of their child. Check that their leave is correctly registered. Buy a present beforehand. Send a small card just after birth. When the baby is born we receive the name and etch the name into the present. A card needs to be signed by all employees and given during a visit to the employee by a small delegation.

**Shape:** The 'Birth leave' Playbook creates a one-off Occasion on the estimated due date, which the User moves to the real birth date once it is known, with a 'Card signers' Role filled by a Group so every colleague gets their own signature Task before the visit.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Birth leave', Roles 'Employee' (Lotte de Vries, email address set) and 'Card signers'.
- Group 'Everyone': Google Group all@company.com, no exclusions; fills Role 'Card signers'.
- Occasion 'Birth: Lotte de Vries's child', a day, created 2026-09-28 on the estimated date 2026-11-15, Area Work (Active hours weekdays 8 to 18, default Privacy Private).
- Task 'Check Lotte's leave is registered', Anchor the Occasion, Offset 'Available from 6 weeks before the start, Due 5 weeks before', giving 2026-10-04 to 2026-10-11; Notes hold a link to the leave system.
- Prep Task 'Buy present for Lotte's baby', Anchor the Occasion, Offset '2 weeks before the start', Due 2026-11-01, Detached right after creation so its Due stays fixed.
- Follow-up 'Get baby's name from Lotte', Anchor the Occasion, Offset '1 Working day after the start', Due 2026-11-16; Notes hold the name.
- Follow-up 'Send small card just after the birth', Anchor the Occasion, Offset '2 days after the start', Due 2026-11-17.
- Activity 'Visit Lotte with a small delegation', Anchor the Occasion, Offset '8 days after the start at 14:00, 30 min', giving 2026-11-23 14:00-14:30. Busy, not Workable, Privacy Private, Guests added by hand: Lotte de Vries, Fatima de Groot and Alex Renkema; ASYS is the organiser.
- Prep Task 'Order engraving of present with baby's name', Anchor the Visit, Offset '3 Working days before its start', Due 2026-11-18, blocked by 'Get baby's name from Lotte' and by 'Buy present for Lotte's baby'.
- Playbook Task 'Get signature: <colleague>', marked per member for Role 'Card signers' and leaving out the Persons who fill the Occasion's other Roles (Lotte), Anchor the Visit, Offset '2 Working days before its start', Due 2026-11-19; one copy per matched member, linked to that colleague.
- On 2026-11-09 the baby is born early and the User moves the Occasion to 2026-11-09.

**Acceptance criteria:**
1. Moving the Occasion from 15 to 9 November moves every open anchored item exactly once, each from its own Offset: the name Task to Due 10 November, the card to Due 11 November, the Visit to 17 November 14:00, the engraving to Due 12 November and every signature Task to Due 13 November.
2. The Detached 'Buy present for Lotte's baby' keeps its Due of 1 November, and 'Check Lotte's leave is registered', already Done, keeps its dates.
3. 'Order engraving of present with baby's name' is Blocked while 'Get baby's name from Lotte' or 'Buy present for Lotte's baby' is Open or Delegated.
4. The signature Tasks are made when the per-member Task becomes Available, here as soon as the Occasion is created on 28 September: ASYS reads all@company.com's members, matches them to Persons by email, leaves out Lotte de Vries because she fills Role 'Employee', and raises a Review item for any member without a Person; a colleague who joins later gets no signature Task.
5. The Visit has Guests, so its Privacy can be Visible or Private but never Hidden, and moving it sends Google's normal update to Lotte, Fatima and Alex.
6. Moving only the Visit from 17 to 18 November moves the engraving Task and every signature Task one Working day later.

**Manual by design:**
- Checking the leave registration: a manual Task with a link to the leave system in its Notes, since reading leave data is out of scope.
- Buying the present and having it engraved: ordering done outside ASYS; the Tasks only track it.
- Collecting each signature, sending the small card and handing over the signed card: physical steps; ASYS tracks only that each happened.

## S8. Year-end leave balance

> Employees that have too much leave open until the end of the year need a check-in.

**Shape:** A standalone yearly Task prompts the User to review leave balances by hand, after which the User creates one Task per flagged employee and Delegates it to them, because who needs it is only known after the manual review.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Task 'Review leave balances for year-end', no Anchor, Series with Fixed recurrence yearly, Available from 1 November, Due 8 November (2026-11-01 and 2026-11-08). Area Work (Active hours weekdays 8 to 18), Importance Important, Estimate 30 min, Privacy Private; Notes hold a link to the leave system. Done on 2026-11-05, flagging Anna de Vries and Bram Jansen.
- Task 'Anna de Vries: book remaining leave days before year end', created by hand, no Anchor, Area Work, Importance Important, Estimate 10 min, Due 2026-12-18, Privacy Hidden, linked to Anna de Vries and Delegated to her.
- Its Check-in is due at the default one day before the Task's Due, 2026-12-17, Privacy Hidden, and needs Voice Closed door, set by hand because leave balances are a private topic. On 17 December it closes with Not yet; the next Check-in is 2026-12-18, where it closes with Done.
- Task 'Bram Jansen: book remaining leave days before year end', same shape, Due 2026-12-15, first Check-in 2026-12-14. He is Not yet on 14, 15 and 16 December and still Not yet on 31 December.

**Acceptance criteria:**
1. The Series produces the 2027 Occurrence (Available from 1 November 2027, Due 8 November 2027) without the User setting it up again.
2. Completing 'Review leave balances for year-end' creates no other Task; each 'book remaining leave days' Task is created and Delegated by the User.
3. Delegating Anna's Task opens a Check-in on 17 December unless the User changes it, and the Task leaves the User's working lists.
4. Neither Delegated Task nor any of their Check-ins is mirrored to Google Tasks, because all are Hidden; the Delegated Tasks would not be mirrored even if they were Private.
5. Closing Anna's 17 December Check-in with Not yet opens the next one on Friday 18 December; closing Bram's 14 December Check-in with Not yet opens one on 15 December, and a Check-in closed with Not yet on 16 December opens one on 17 December, never on a date already past.
6. Closing a Check-in with Done marks its Task Done and ends the Delegation; closing it with Take back returns the Task to the User as Open.
7. After 15 December Bram's Task is Overdue while still Delegated, and it returns to the User's working lists only once a Check-in closes with Done or Take back.
8. On 31 December the User Drops Bram's Delegated Task directly; its open Check-in is Dropped with it, and no Take back is needed.
9. Anna's Check-in, needing Closed door, is listed under Not here at an Out loud Place such as an open-plan office; closing it with Not yet by phone gives the next Check-in Closed door again, not Out loud.

**Manual by design:**
- Finding who has too much leave open: a manual Task with a link to the leave system in its Notes, since reading leave data is out of scope.
- Telling each flagged employee to book their leave: done outside ASYS; the Delegated Task only tracks whether it happened.

## S9. Birthday card signing

> Employee birthday card needs signing.

**Shape:** A Series of Occasions made from the 'Employee birthday card' Playbook, one Series per employee (Fixed recurrence, yearly on their birthday), with a 'Card signers' Role filled by a Group so every colleague gets their own Delegated signing Task each year.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Employee birthday card', Roles 'Birthday person' and 'Card signers'.
- Group 'Everyone': Google Group all@company.com, no exclusions.
- Series: Fixed recurrence, yearly on 3 December; Role 'Birthday person' filled by Mila de Groot and 'Card signers' by Group 'Everyone', both remembered by the Series.
- 2026 Occurrence: Occasion 'Mila de Groot's birthday 2026', a day, 2026-12-03, created on 2026-10-08, 8 weeks ahead, Area Work (Active hours weekdays 8 to 18); every Task and Check-in below is Privacy Hidden.
- Prep Task 'Buy birthday card', Anchor the Occasion, Offset '7 Working days before the start', Due 2026-11-24. Estimate 15 min, Importance not Important.
- Playbook Task 'Sign Mila's card', marked per member for Role 'Card signers', leaving out the Person who fills Role 'Birthday person', and Delegated to that Role, Anchor the Occasion, Offset 'Available from 5 Working days before the start, Due 2 Working days before', giving Available from 2026-11-26, Due 2026-12-01; Check-in timing 'same day at 16:00', giving 2026-12-01 16:00. Blocked by 'Buy birthday card'.
- When 'Sign Mila's card' becomes Available (26 November, once 'Buy birthday card' is Done), ASYS reads all@company.com's members read-only, matches them to Persons by email, leaves out Mila de Groot, and raises a Review item for any member without a Person; each matched Person gets one Delegated copy.
- Task 'Give card to Mila', Anchor the Occasion, Offset 'on the start day', Due 2026-12-03, blocked by every 'Sign Mila's card' copy.

**Acceptance criteria:**
1. The 2027 Occurrence (Friday 3 December 2027) fills both Roles from the Series without the User picking them again.
2. Each member of all@company.com who matches a Person gets one 'Sign Mila's card' copy, Mila de Groot gets none, and a member without a Person raises a Review item; ASYS never creates a Person.
3. The copies are fixed when they are made on 26 November (or later, once 'Buy birthday card' is Done): a colleague who joins all@company.com before then gets a copy, and one who joins afterwards gets none for 2026 and gets one in 2027.
4. 'Give card to Mila' is Blocked before the copies are made and while any copy is Open or Delegated.
5. No copy is mirrored to Google Tasks while Delegated, and because the Check-ins are Hidden, none of them is mirrored either.
6. A Check-in that closes with Not yet on Tuesday 1 December opens the next one on Wednesday 2 December, the next Working day.
7. Mila de Groot's Person page lists this Series; deleting or Anonymising her while it is active raises a Review item.
8. Moving the 2026 Occasion from 3 to 4 December moves 'Buy birthday card' to Due 25 November, 'Sign Mila's card' (and any copy already made) to Available from 27 November and Due 2 December, and 'Give card to Mila' to 4 December; the Series and the 2027 date are unchanged.

**Manual by design:**
- Buying the physical card: a Task; the purchase happens outside ASYS.
- Signing the card and handing it to Mila: physical steps; ASYS tracks that each happened, not the act itself.

## S10. Evening session at the office

> Evening session at the office needs a guage for food, and a check that enough snacks and drinks are available.

**Shape:** The 'Evening session at the office' Playbook creates a one-off Occasion each time a session is scheduled, since these follow no calendar schedule; it carries the session Activity, with the whole company as Guest, and two Prep Tasks.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Evening session at the office', Role 'Staff', filled by Group 'All employees' (all@company.com, no extra Persons, excluding Pieter Smit) when the Occasion is created.
- Occasion 'Evening session, 12 November 2026', a moment, 2026-11-12 18:00, Area Work (Active hours weekdays 8 to 18, default Privacy Private).
- Activity 'Evening session', Anchor the Occasion, Offset 'at the start, 3 h', giving 2026-11-12 18:00-21:00. Busy, not Workable, Privacy Private, Guest: the Group filling Role 'Staff', invited through all@company.com as a whole; ASYS is the organiser. The room is noted in its Notes, since Place applies only to Tasks.
- Prep Task 'Gauge headcount for food', Anchor the Occasion, Offset 'Available from 3 Working days before the start at 09:00, Due 17:00 that day', giving 2026-11-09 09:00-17:00. Estimate 10 min, Importance not Important; Notes hold the draft message and, later, the manual tally.
- Prep Task 'Check snacks and drinks stock', Anchor the Occasion, Offset 'Available from the start day, Due 15:00', giving Due 2026-11-12 15:00. Estimate 15 min, Importance not Important, Place Office, blocked by 'Gauge headcount for food'.

**Acceptance criteria:**
1. The session invites Group 'All employees' through all@company.com: someone who joins that address after the Invite went out is included, and Pieter Smit, though excluded from the Group, is invited too, because a Group's exclusions never apply to Guests.
2. Because the session has a Guest, its Privacy can be Visible or Private but never Hidden.
3. Moving the Occasion from Thursday 12 to Friday 13 November moves the session to 13 November 18:00, 'Gauge headcount for food' to 10 November and 'Check snacks and drinks stock' to Due 13 November 15:00, and Google sends its normal update to all@company.com; a Prep already Done keeps its date.
4. 'Check snacks and drinks stock' is Blocked while 'Gauge headcount for food' is Open or Delegated.
5. Because 'Check snacks and drinks stock' has Place Office, the Picker leaves it out while the User is elsewhere and lists it under Not here ('Only at Office'); when the User's position is unknown it is not left out.
6. If stock is short, 'Buy more snacks and drinks' is a Task the User adds by hand; completing the stock check creates no Task.

**Manual by design:**
- Sending the food-gauge message and reading the replies: done outside ASYS; ASYS records no replies or headcount, and the tally is free text in the gauge Task's Notes.
- Buying extra snacks and drinks: a Task added by hand; the purchase happens outside ASYS.

## S11. Employee starts at a new client

> Employee starts work at a new client. Create a card image, order card, sign the card and send the card. Check-in after first day & after first week.

**Shape:** The 'New client placement' Playbook creates a one-off Occasion on the employee's start date, since each placement happens once, carrying a blocked-by chain of card Tasks (one Delegated, one per member of a Group) and two Follow-ups after the start.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'New client placement', Roles 'Consultant' (Bram Jansen), 'Office manager' (Iris de Boer) and 'Card signers'.
- Group 'Consultancy team': Google Group team@company.com, no exclusions; fills Role 'Card signers'.
- Occasion 'Bram Jansen starts at Northwind BV', a day, 2026-11-02, Area People Ops (Active hours weekdays 8 to 18, default Privacy Private); every Task below is Privacy Private.
- Prep Task 'Design card image', Anchor the Occasion, Offset 'Available from 15 Working days before the start, Due 10 Working days before at 17:00', giving Available from 2026-10-12, Due 2026-10-19 17:00. Estimate 20 min, Importance Important, Delegated to Role 'Office manager' (Iris de Boer); Check-in timing 'same day at 09:30', giving 2026-10-19 09:30.
- Prep Task 'Order card', Anchor the Occasion, Offset '7 Working days before the start, Due 17:00', giving Due 2026-10-22 17:00. Estimate 15 min, Importance Important, blocked by 'Design card image'.
- Playbook Task 'Get signature: <colleague>', marked per member for Role 'Card signers' and leaving out the Person who fills Role 'Consultant', Anchor the Occasion, Offset '4 Working days before the start, Due 17:00', giving Due 2026-10-27 17:00, Estimate 5 min, blocked by 'Order card'; one copy per matched member, linked to that colleague.
- Prep Task 'Send card', Anchor the Occasion, Offset '2 Working days before the start, Due 17:00', giving Due 2026-10-29 17:00. Estimate 10 min, blocked by every 'Get signature' copy.
- Follow-up 'Call Bram after his first day', Anchor the Occasion, Offset '1 Working day after the start', Due 2026-11-03, needs Voice Closed door.
- Follow-up 'Call Bram after his first week', Anchor the Occasion, Offset '1 week after the start', Due 2026-11-09, needs Voice Closed door.

**Acceptance criteria:**
1. Once 'Order card' is Done and the signature Task becomes Available, each member of team@company.com who matches a Person gets one 'Get signature' copy, Bram Jansen gets none because he fills Role 'Consultant', and a member without a Person raises a Review item; ASYS never creates a Person.
2. If team@company.com's members cannot be read, the copies go to the Persons kept by hand as the Group's members.
3. The copies are fixed when they are made: a colleague who joins team@company.com after 'Order card' is Done gets no copy.
4. 'Send card' is Blocked before the copies are made and while any 'Get signature' copy is Open or Delegated.
5. 'Design card image' gets its Check-in on 19 October at 09:30 instead of the default one day before its Due; while Delegated the Task is not mirrored to Google Tasks, and its Check-in is, title only.
6. If that Check-in closes with Not yet on Monday 19 October, the next Check-in defaults to Tuesday 20 October.
7. 'Design card image''s Effective due is the earlier of its own Due and 'Order card''s Latest start: if the User sets 'Order card''s Due to 19 October 12:00, 'Design card image''s Effective due becomes 19 October 11:45.
8. Moving the Occasion from 2 to 4 November moves every open item two Working days later ('Design card image' Due 21 October, 'Order card' 26 October, 'Get signature' and any copies 29 October, 'Send card' 2 November, Follow-ups 5 and 11 November); a Task already Done keeps its date.
9. On Tuesday 3 November at 08:05, on a Silent train ride, the Picker leaves 'Call Bram after his first day' out and shows it above the ranking under Not here ('needs Closed door; Train to Utrecht is Silent until 08:44'); at an Out loud Office it stays under Not here, and after the User picks Closed door in Now it is ranked until the next Activity starts or ends, for at most 2 hours.

**Manual by design:**
- The card image file: kept outside ASYS, with a link in 'Design card image''s Notes.
- Ordering, collecting signatures on and sending the physical card: done outside ASYS; the Tasks only track that each step happened.
- The two calls with Bram: made by phone; the Follow-ups only track that they happened.

## S12. Pre-intake talk and practise for a client intake

> Employee has an intake with a potential client: pre-intake talk to remind them about a couple of things. Practise.

**Shape:** The 'Client intake' Playbook creates a one-off Occasion at the moment of the consultant's intake, which takes none of the User's time, carrying two Activities the User holds with the consultant beforehand.

**How ASYS models it** (one example run with concrete 2026 dates and times):
- Playbook 'Client intake', Roles 'Consultant' (Youssef Amrani, email address set) and 'Prospective client' (Dennis Vermeulen), filled when the Occasion is created.
- Occasion 'Intake: BrightLedger BV with Youssef', a moment, 2026-11-20 14:00, Area Business Development (Active hours weekdays 8 to 18, default Privacy Private); its Notes hold the client's address.
- Activity 'Pre-intake talk with Youssef', Anchor the Occasion, Offset '2 Working days before the start at 16:00, 30 min', giving 2026-11-18 16:00-16:30. Busy, not Workable, Privacy Private, Guest Youssef Amrani; ASYS is the organiser. Notes hold the reminders to cover (confidentiality, pricing boundaries, what not to promise).
- Activity 'Practise intake with Youssef', Anchor the Occasion, Offset '1 Working day before the start at 11:00, 45 min', giving 2026-11-19 11:00-11:45. Busy, not Workable, Privacy Private, Guest Youssef Amrani; ASYS is the organiser.

**Acceptance criteria:**
1. Youssef receives Google's Invite for the Pre-intake talk and for the Practise session, with ASYS as the organiser of both.
2. Because both Activities have a Guest, their Privacy can be Visible or Private but never Hidden.
3. Moving the Occasion from Friday 20 to Monday 23 November moves the Pre-intake talk to 19 November 16:00 and the Practise session to 20 November 11:00, and Google sends Youssef its normal update for each.
4. Moving the Pre-intake talk by hand to 17 November 16:00 rewrites its Offset to 3 Working days before the start, so a later move of the Occasion keeps that distance.
5. Nothing Busy is written to Google Calendar for the intake itself, since an Occasion takes none of the User's time.
6. Creating a second Occasion from 'Client intake' for another consultant and client assigns its own Persons to both Roles and leaves this Occasion's Roles unchanged.
7. ASYS records no reply from Youssef to either Invite; any acceptance exists only in Google Calendar.

**Manual by design:**
- Arranging the intake meeting with the client: left to Youssef; ASYS sends the client nothing.
