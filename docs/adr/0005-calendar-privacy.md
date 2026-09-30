<!-- SPDX-License-Identifier: EUPL-1.2 -->
# Privacy toward Google is a core rule, and Hidden details never reach Google

Every Activity ASYS writes to Google Calendar has a Privacy level: Private by default (Google's private visibility, so colleagues only see that the user is busy), Visible when opted in, or Hidden, where ASYS writes only a placeholder title and no description or location. The core reduces the data before the Google Calendar add-on receives it, so Hidden details never reach the employer's Workspace; the defaults are set per Area (Personal is Hidden). Reminder notifications follow the same level: a Visible item's notification shows its title, while a Private or Hidden item's shows only a generic line such as "Meeting in 5 min, 2 Prep open", and one setting can make every notification generic.

The same Privacy governs Tasks mirrored to Google Tasks in the work account: a Visible Task is mirrored with its title and notes (edits sync both ways), a Private Task with its title only, and a Hidden Task is not mirrored at all, so Personal Tasks stay out of the employer's Workspace by default.

An Activity with Guests can be Visible or Private but never Hidden, because Google shows the full event to everyone it invites; ASYS is the organiser of those Invites, moving the Activity sends Google's usual update to the Guests, and cancelling it (for example by Skipping its Occurrence) sends Google's cancellation.

## Considered Options

- **Rely on Google's private visibility only**: rejected because private details are still stored in the employer's Workspace and are visible to anyone granted "see private details".
