# Household workspace rework — 2026-10-05

The interface now follows household workflows: Alltag (overview, calendar, tasks, cleaning), Essen & Einkauf (menu, shopping, recipes, ingredients), and weather. A light, shared visual system replaces the mixed dark styling. Desktop navigation uses a sidebar; mobile navigation uses a bottom dock and drawer.

The dashboard uses the available viewport and gives new households six useful widgets. Existing saved layouts are retained. Calendar has a readable mobile agenda. Recipes offer distinct editing and cooking actions; shopping entries remain individually actionable even when names match.

Dialogs share focus trapping, Escape dismissal, focus restoration and scroll locking. Task, recipe, calendar, cleaning and meal-selection forms retain entered data after failed requests and prevent repeated submissions while saving. Task dates use local-day boundaries, cleared optional fields are sent as null, and recurring task completion uses the server's updated state.

Cooking exports the opened recipe with the selected persons and units per person, rather than an unrelated planned meal. Duplicate export of the same selection is blocked within the open cooking dialog. Backend input validation covers task dates and recipe scaling.

Validation: 51 frontend tests, 18 Django tests, production build, and browser checks at desktop, tablet and 390px mobile widths. Browser checks use fixture data and simulated failed requests; production household data and connected services were not exercised. The build succeeds with bundle/component-style budget warnings. These remain a performance cleanup opportunity.
