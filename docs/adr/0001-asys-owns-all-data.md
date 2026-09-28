# ASYS owns all data; Google Calendar and Google Tasks are mirrors

ASYS keeps its own store as the source of truth for Tasks, Activities, Occasions and everything attached to them. Google Tasks cannot hold most of the model (no Available from, no time of day on a due date, no recurrence through the API, no field for Importance, duration, Place or any custom data, and no change notifications), so it only serves as a place to capture Tasks and to see and tick off open ones. Google Calendar receives ASYS's Activities so colleagues can see when the user is busy, and supplies the accepted, tentative and self-organised events on the primary calendar as Activities; nothing ASYS needs depends on being stored in Google.

## Considered Options

- **Store everything in Google** (Tasks notes, Calendar extended properties): rejected, because Google Tasks has no custom-data field and would force ASYS's model down to what Google Tasks can express.
- **No Google Tasks integration**: rejected, because capture from Gmail and the Google apps, and seeing open Tasks next to the calendar, were explicit goals.

## Consequences

Which side wins a change depends on where an Activity came from. For invites imported from Google Calendar, the organiser owns the time and attendees, and ASYS shows them read-only; for Activities ASYS created, a time change made in Google is accepted as the user's own edit. Google never changes fields that only ASYS holds.

Recurring Activities that ASYS creates are written as one Google event per Occurrence, created on a rolling horizon of about 8 weeks, never as a Google recurring event; editing "this Occurrence" changes only that Activity, "this and following" ends the Series and starts a new one, and moving one of these events in Google counts as editing that Occurrence. This keeps one Occurrence model across ASYS and avoids mapping Google's recurrence exceptions, at the cost of colleagues seeing these busy blocks only about 8 weeks ahead.

A Playbook can be applied to an imported invite: its Prep and Follow-ups are anchored to that Activity, so they move when the organiser moves it, and a cancellation raises the usual Review item; the invite itself stays read-only. ASYS captures from every Google Tasks list, including tasks created from Gmail, and mirrors each Task into the Google Tasks list of its Area (the default list when it has none), with a line in the notes linking back to ASYS. A Delegated Task is not mirrored to Google Tasks while it is Delegated; its Check-ins are, so ticking something off in Google can never skip a Check-in.

Group membership is the one thing ASYS takes from Google as the source of truth. A Group names Google Group addresses, and when per-member copies are made ASYS reads those groups' current members through the Google Connection (read-only), matches them to Persons by email, removes the Group's excluded Persons, and raises a Review item for members without a Person; ASYS never creates Persons on its own. If a Google Group's members cannot be read, that Group's members are kept by hand. Reading members this way is verified against the actual Workspace before it is relied on.
