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
