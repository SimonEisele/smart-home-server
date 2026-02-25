export interface NoteCategory {
  id: string;
  title: string;
  parentCategoryId?: string;
  order?: number;
}

export interface Note {
  id: string;
  title: string;
  content: string;
  userID?: string;
  categoryID?: string;
  global?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CategoryNode extends NoteCategory {
  children: CategoryNode[];
  notes: Note[];
  expanded?: boolean;
}