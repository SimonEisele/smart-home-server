"""Feature API views, one module per area; re-exported for urls.py and tests."""
from .common import (  # noqa: F401
    HasActiveHousehold,
    menu_queryset,
    recalculate_menu_persons_for_range,
)
from .ingredients import (  # noqa: F401
    CanEditIngredientCatalog,
    IngredientListView,
    IngredientDetailView,
)
from .todos import (  # noqa: F401
    TodoListCreateView,
    TodoDetailView,
)
from .recipes import (  # noqa: F401
    RecipeListCreateView,
    RecipeDetailView,
)
from .menus import (  # noqa: F401
    MenuListCreateView,
    MenuDetailView,
    RecalculateMenuPersonsView,
)
from .shopping import (  # noqa: F401
    ShoppingItemListCreateView,
    ClearCheckedShoppingItemsView,
    ShoppingItemDetailView,
    ShoppingSuggestionView,
    AddRecipeToShoppingListView,
    ExportWeekToShoppingListView,
)
from .calendar import (  # noqa: F401
    CalendarEventListCreateView,
    CalendarEventDetailView,
)
from .attendance import (  # noqa: F401
    HouseholdMemberListCreateView,
    HouseholdMemberDetailView,
    MemberAvailabilityListCreateView,
    MemberAvailabilityDetailView,
    UserMealAttendanceView,
    ExternalMealGuestListCreateView,
    ExternalMealGuestDetailView,
)
from .cleaning import (  # noqa: F401
    CleaningTaskListCreateView,
    CleaningTaskDetailView,
    CleaningLogListCreateView,
    CleaningLogDetailView,
)
