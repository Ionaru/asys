<!-- SPDX-License-Identifier: EUPL-1.2 -->
# ASYS

ASYS (Assisting System) helps its user decide what to do next, by holding the work that can be done at any time, the things fixed in time, and the dated moments that need preparation and follow-up.

## Language

### Work

**Task**:
A piece of work with an Estimate that is not fixed in time and is meant to be done at some point while it is Available.
_Avoid_: To-do, action, item, card

**Subtask**:
A Task that is part of another Task and shares its Anchor; a Subtask never has Subtasks of its own.
_Avoid_: Checklist item, child task

**Estimate**:
The time a Task still needs; you lower it as you make progress.
_Avoid_: Duration (reserved for Activities)

**Activity**:
Something that starts at a fixed moment and lasts a set duration; it is either Busy or Free, and either Workable or not. An Activity that is not Workable, such as a call, can need a Voice.
_Avoid_: Event, calendar event, appointment

**Time block**:
A Busy, Workable Activity reserved for working on one specific Task; it gives no Voice and needs the Voice its Task needs.

**Occasion**:
A dated anchor (a moment, a day, or a date range) that takes none of your time itself; the Tasks and Activities that belong to it are positioned relative to it.
_Avoid_: Event, milestone

**Playbook**:
A reusable template of Tasks and Activities, each with an Offset; creating an Occasion from a Playbook, or applying it to an existing Activity, copies them onto it.
_Avoid_: Template, blueprint, checklist

**Series**:
The rule that produces the Occurrences of a recurring Task, Activity or Occasion; it remembers which Persons or Groups fill its Roles.
_Avoid_: Recurrence rule

**Notes**:
Free text kept on a Task, Activity, Occasion or Person.

**Occurrence**:
One instance of a recurring Task, Activity or Occasion; editing one Occurrence never changes its Series. An Occurrence of an Activity or Occasion is created 8 weeks before its date, or earlier when one of its items becomes Available earlier.
_Avoid_: Iteration, instance

**Area**:
A broad group that Tasks, Activities and Occasions belong to, such as Work, Personal or Recruitment.
_Avoid_: Project, list, category

**Active hours**:
The times an Area is in use, such as weekdays 8 to 18 for Work; outside them the Picker leaves that Area's Tasks out.

**Person**:
Someone your work involves, such as an employee or an applicant; a Person is never a User of ASYS.
_Avoid_: Contact, user

**Group**:
A named set of Persons made of one or more Google Groups plus extra Persons, minus any Persons you exclude, such as everyone in all@company.com who registers hours. A Role can be filled by a Group. Only Tasks can be marked per member: such a Playbook Task is copied once for each member when it becomes Available, as the Group stands at that moment, and can leave out the Persons who fill the Occasion's other Roles. Exclusions never apply to Guests.
_Avoid_: Team, list

**Guest**:
A Person or Group invited to an Activity; a Group is invited through its Google Group addresses as a whole.
_Avoid_: Attendee, participant

**Invite**:
A calendar invitation: one someone else sent you, which becomes an Activity, or one ASYS sends to the Guests of an Activity.
_Avoid_: Meeting request

**Role**:
A named part a Person or Group plays in a Playbook, such as candidate, hiring manager or all employees; creating an Occasion assigns a Person or Group to each Role, and an Activity's Guests can be given as Roles. When a Playbook is applied to an Invite, a Role that none of its guests matches stays empty and raises a Review item.

**Anonymise**:
Removing a Person's name and the notes about them while keeping the dates and states of everything they were linked to.

### Calendar

**Busy**:
An Activity during which others cannot book you.

**Free**:
An Activity during which others can still book you.

**Workable**:
An Activity during which you can do Tasks, such as a train ride; it can give a Voice, which ASYS asks for when you mark it Workable, and when that Voice is Out loud or Closed door it can be Voice only, such as a drive.

**Gap**:
A stretch of time with no Activity in it, or only Workable ones; the time in which Tasks can be done.
_Avoid_: Free window, free time (Free is an Activity property)

**Privacy**:
How much ASYS shares with Google about an Activity or Task: **Visible** (everything), **Private** (for an Activity, others see only that you are busy; for a Task, only its title) or **Hidden** (an Activity becomes a placeholder title and a Task is not mirrored; the details never leave ASYS). Each Area sets a default.

**Current time zone**:
The time zone ASYS treats as where you are; your phone keeps it up to date, and dates without a time follow it.

### Timing

**Anchor**:
The Occasion or Activity a Task or Activity is positioned relative to, including an Activity that came from someone else's invite. Anchors can chain (a Task anchored to an Activity anchored to an Occasion), and moving an Anchor moves everything anchored below it exactly once. Done, Dropped and Skipped items keep their dates, and changing an anchored item's date by hand rewrites its Offset.
_Avoid_: Parent (reserved for Subtasks)

**Offset**:
The position of an anchored Task or Activity relative to the start or the end of its Anchor, such as "14 days before the start" or "on the last day at 16:00"; an Activity's Offset also carries its duration.

**Detach**:
Turning an anchored item's Offset into fixed dates, so it no longer moves with its Anchor; **Attach** is the reverse.

**Prep**:
A Task anchored before its Anchor, such as preparing the agenda for a meeting.
_Avoid_: Preparation task

**Follow-up**:
A Task anchored after its Anchor, such as writing feedback after an interview.
_Avoid_: Check-in (reserved for Delegated Tasks)

**Available from**:
The moment before which a Task is not meant to be done; without a time, it means the start of that day. Completing a Task earlier is allowed but not suggested.
_Avoid_: Start date, defer date, not before

**Due**:
The moment after which an unfinished Task is Overdue; without a time, it means the end of that day.
_Avoid_: Deadline

**Overdue**:
A Task whose Due has passed while it is not yet done.

**Effective due**:
The earliest of a Task's own Due and the Latest starts of the Tasks it blocks, following the whole chain of blocked Tasks.

**Latest start**:
A Task's Effective due minus its Estimate: the last moment you could start it and still finish in time.

**Available**:
A Task is Available when it is Open, out of the Inbox, past its Available from, and not Blocked.

**Blocked**:
A Task is Blocked while any of the Tasks it depends on is still Open or Delegated; a Task can depend on several. A Task that depends on a per-member Task is also Blocked until that Task's copies exist.

**Working day**:
A weekday that falls within an Area's Active hours; public holidays are not taken into account.

**Fixed recurrence**:
Repeating on a calendar schedule, such as every other Monday, the first Tuesday of the month or the last Working day of the month.

**Floating recurrence**:
Repeating a set interval after the previous Occurrence was completed or skipped, such as two weeks after the last coffee check.

### Priority

**Importance**:
Whether a Task is important; always set by you.

**Urgency**:
Whether a Task's Latest start falls within your Urgency window (or has passed); always derived, never set by hand. A Task without an Effective due is never urgent.

**Urgency window**:
How far ahead of a Task's Latest start it counts as urgent; two days unless you change it.

**Quadrant**:
One of **Do** (important and urgent), **Plan** (important, not urgent), **Delegate** (urgent, not important) and **Drop** (neither), derived from Importance and Urgency and only ever used as a suggestion; a recurring Task is never suggested for Drop.
_Avoid_: Schedule (use Plan), Eliminate (use Drop)

### Lifecycle

**Open**:
A Task that still needs doing.

**Delegated**:
A Task handed to a Person to do; it leaves your working lists until a Check-in ends the delegation with the Outcome Done or Take back. It can also be Dropped directly, which drops its open Check-in too.

**Check-in**:
A Task to ask the Person a Delegated Task was handed to whether it is done, due one day before that Task's Due unless you change it; it closes with the Outcome Done, Not yet (which creates the next Check-in, by default on the next Working day, and asks whether it is by message, needing no Voice, or by phone, needing Out loud, or Closed door when the closed Check-in needed that) or Take back. A Check-in timed by its Playbook moves when its Task's Due moves; one you dated by hand stays. A Playbook item can set its Check-ins' Voice next to their timing, and delegating a Task by hand asks whether its first Check-in is by message or by phone (Out loud), by message unless you pick by phone.
_Avoid_: Follow-up

**Take back**:
The Check-in Outcome that returns a Delegated Task to you as Open.

**Done**:
A Task that has been completed.

**Dropped**:
A Task you decided not to do; it stays in history.

**Skipped**:
A Task or Occurrence left out because what it served will not happen, such as the Prep of a cancelled meeting; unlike Dropped, it is no judgement on the work, and it does not affect later Occurrences.

**Cancelled**:
An Activity or Occasion that will no longer happen, for example because its Occurrence was Skipped; Tasks are never Cancelled, they are Dropped or Skipped.

**Upcoming**:
An Occasion whose date has not passed yet or that still has Open Tasks; once neither is true it is **Past**.

**Outcome**:
The named result you pick when completing certain Tasks, such as a Check-in's Done, Not yet or Take back.

### Capture and review

**Inbox**:
Where captured Tasks and Review items wait for you.

**Review item**:
An Inbox entry ASYS creates when something needs your decision, such as a cancelled meeting that still has Open Prep.

**Triage**:
Giving an Inbox Task its Importance and Estimate, which moves it out of the Inbox.

**Picker**:
The answer to "what should I do now?": the Available Tasks that fit the current Gap, Place, Current voice and Active hours, ranked by Urgency and Importance, each with a reason; while Voice only holds, only Tasks that need a Voice are ranked. Tasks left out only because of their Place, their Voice or Voice only are listed under **Not here** with the reason, and the urgent ones among them are shown above the ranking, except while Voice only holds. It can be filtered to the Tasks that need exactly a given Voice. Shown as **Now** in the app.

**Reminder**:
A moment ASYS tells you about something, such as an Activity about to start with open Prep.

**Morning briefing**:
The daily Reminder that lists the day's Activities and the Tasks that need you.

**Today**:
The day's Activities in order, with the Gaps between them.

**Weekly review**:
A recurring Activity, Friday afternoon unless you change it, in which you empty the Inbox, handle Overdue Tasks, act on Delegate and Drop suggestions, look at untouched Time blocks and Check-ins coming due, and look at the coming week and its Occasions.

### Places and Voice

**Place**:
A named, specific location with a position and a radius, such as the office; a Task can be limited to Places (a Task without Places can be done anywhere), and a Place can give a Voice, which ASYS asks for when you create it. When your position is unknown, the Picker leaves out no Task for its Place.
_Avoid_: Location, context

**Voice**:
How freely you can talk, in three steps that each allow everything the step before allows: **Silent** (talking would bother others, such as on a train), **Out loud** (you can talk but others hear you, such as at an open-plan desk) and **Closed door** (nobody overhears you, such as at home). A Task or an Activity can need Out loud or Closed door, and one that needs no Voice can be done anywhere, though a Task that needs no Voice is left out while Voice only holds; a Voice is copied from Playbook items and Series like Estimate and Importance, including onto per-member copies, has no Area default, and is not inherited by Subtasks. Voice never changes Available, Urgency or Quadrant, never reaches Google, and ASYS never moves anything because of it.
_Avoid_: Setting, surroundings, context, private or confidential (Privacy is what Google sees)

**Current voice**:
The Voice ASYS takes you to have now: the one you picked in Now (kept on that phone only, until the next Activity starts or ends and for at most 2 hours), otherwise the Voice that allows least among the Workable Activities under way, otherwise the Voice of the Place you are at; otherwise it is unknown, and the Picker leaves out no Task for its Voice.

**Voice only**:
A state in which you can talk but cannot use your hands or eyes, such as while driving, so only Tasks that need a Voice can be done, such as calls and Check-ins by phone. It holds while a Workable Activity marked Voice only is under way, unless you pick a Voice in Now, or once you pick Voice only in Now. In Now it is one more choice next to the three Voices: picking it replaces a picked Voice and is kept the same way, and Current voice then comes from the Workable Activities and the Place. Like Voice, it never changes Available, Urgency or Quadrant, never reaches Google, and ASYS never moves anything because of it.
_Avoid_: Driving mode, hands-free, calls only, context

**Voice clash**:
An Activity or Time block that needs a Voice overlapping a Workable Activity whose Voice does not allow it, such as a phone call during a Silent train ride; ASYS warns inline when you cause it and raises one Review item per pair when it arises by itself (a new Occurrence, an Anchor move, an organiser's change), and never moves anything.

### Accounts

**User**:
Someone who signs in to ASYS; everything a User creates belongs to that User alone.
_Avoid_: Account, member

**Sign-up link**:
A one-time link that lets someone become a User; there is no open sign-up.
_Avoid_: Invite (reserved for calendar invitations)

**Connection**:
A link from a User's ASYS to an outside account, such as their work Google account; it is separate from how the User signs in.
_Avoid_: Integration, login

**Add-on**:
An optional part of ASYS that syncs with or imports from an outside service, such as Google Calendar sync or a Todoist import, using a Connection where it needs one.
_Avoid_: Integration, plugin
