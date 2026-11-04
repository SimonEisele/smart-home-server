# Household workspace rework — 2026-10-05

The interface now follows household workflows: Alltag (overview, calendar, tasks, cleaning), Essen & Einkauf (menu, shopping, recipes, ingredients), and weather. A shared dark visual system uses slate surfaces, clear text contrast and mint accents. Desktop navigation uses a sidebar; mobile navigation uses a bottom dock and drawer.

The dashboard uses the available viewport and gives new households six useful widgets. Existing saved layouts are retained. Calendar has a readable mobile agenda. Recipes offer distinct editing and cooking actions; shopping entries remain individually actionable even when names match.

Dialogs share focus trapping, Escape dismissal, focus restoration and scroll locking. Task, recipe, calendar, cleaning and meal-selection forms retain entered data after failed requests and prevent repeated submissions while saving. Task dates use local-day boundaries, cleared optional fields are sent as null, and recurring task completion uses the server's updated state.

Cooking exports the opened recipe with the selected persons and units per person, rather than an unrelated planned meal. Duplicate export of the same selection is blocked within the open cooking dialog. Backend input validation covers task dates and recipe scaling.

Validation: 59 frontend tests, 18 Django tests, production build, and browser checks at desktop, tablet and 390px mobile widths. Browser checks use fixture data and simulated failed requests; production household data and connected services were not exercised. The build succeeds with bundle/component-style budget warnings. These remain a performance cleanup opportunity.


## Dark design and attendance follow-up

The calendar now separates “Termine & Aufgaben” from “Anwesenheiten & Mahlzeiten”. Attendance uses responsive day cards with explicit meal toggles, current status, participant names and counts. A whole-day action changes all three meals in one request. Guests use a focused dialog with date and meal context. The shared household account remains a planning overview; personal attendance is entered using a personal account.

Requests for the same day are serialized by disabling its controls while saving. A failed save retains the previous attendance, a failed guest save retains the name, and a failed deletion retains the guest. Attendance controls stay disabled until the weekly data is loaded. Delayed responses from a previous week do not replace the displayed week's data. Name disambiguation counts distinct users instead of repeated records across days.

Eight additional workflow tests cover attendance and guests. Browser checks exercise meal toggles, whole-day selection and guest add/delete failure recovery at 1280px and 390px, in addition to the existing page and dialog checks. Backend contracts and stored data are unchanged.

## Linked task planning follow-up

Dragging a linked task block back into the left “Noch nicht eingeplant” sidebar removes that calendar block after successful deletion. The task, its completion state, estimated duration and other planned blocks are preserved. The task returns to the sidebar when its final block in the displayed week is removed. Ordinary appointments cannot be deleted through this drop target. Touch uses the same removal method. The event dialog provides “Planung entfernen” for mobile and non-drag interaction.

Task-linked events inherit title, description and visibility from the accessible task. Task edits update linked blocks atomically, retaining split labels such as “(1/2)”. The calendar dialog makes task-owned fields read-only and links to task management. Completed linked tasks are visually marked. Resizing a block only changes that block's duration, rather than overwriting the task's total estimate.

Validation: 65 frontend tests and 22 Django tests passed; production build succeeds with existing size warnings. Browser fixture checks include desktop drag into the calendar and back, removal failure/retry, ordinary appointment safety and mobile dialog removal. No database migration is required.

## Menu planning and export follow-up

The menu page has a clear weekly overview with separate meal selection/removal actions, current attendance, leftover portions and extras. Mobile shows compact daily rows. The recipe picker separates fresh cooking from leftovers and accepts only earlier cooked meals within seven days. An original cooking meal cannot be removed while leftover meals still reference it. New menu entries immediately return current attendance.

“Einkauf vorbereiten” selects cooking meals and extras, then requests a server-generated ingredient preview. Mobile separates selection from ingredient review. Normal meals scale by current persons, extra leftover diners (including the next week), recipe units per person and base recipe servings. Extras use an explicit number of recipe portions/pieces. Zero attendance never becomes an implicit two-person meal. Unknown quantities are flagged for review; zero remains zero.

Weekly export updates the existing menu-plan shopping items for the selected ISO week rather than appending duplicates. Unselected old weekly positions are removed, as explained in the dialog. Manual items and other weeks remain intact. Existing checked items retain their state if quantities do not change; changed quantities become unchecked. The ISO week/year comes from the server. A preview token rejects changed plans before committing; selection survives failed requests.

The shopping-list page opens the same menu export preview directly, replacing its duplicated older export dialog. Older single-meal widget exports retain their additive API behaviour; they use the corrected scaling and no invented attendance. The implementation does not convert units such as kg and g; different units remain separate positions.

Validation: 77 frontend tests, 34 Django tests, production build, and browser fixture checks at 1280px and 390px for recipe selection, preview quantities, extra amounts, failed export/retry and navigation to shopping. Other page, attendance and dialog regression checks pass. Existing bundle and unrelated component style warnings remain; menu-page styles are below their warning budget. No database migration is needed.
