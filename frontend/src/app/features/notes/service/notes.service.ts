import { Injectable } from '@angular/core';
import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { AuthService } from '../../../core/auth/service/auth.service';
import { CategoryNode, Note, NoteCategory } from '../model/notes.model';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class NotesService {
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Mock-Daten
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  private categories$ = new BehaviorSubject<NoteCategory[]>([
    { id: 'work', title: 'Arbeit', order: 1 },
    { id: 'projectA', title: 'Projekt A', parentCategoryId: 'work', order: 1 },
    { id: 'projectB', title: 'Projekt B', parentCategoryId: 'work', order: 2 },

    { id: 'private', title: 'Privat', order: 2 },
    { id: 'shopping', title: 'Einkauf', parentCategoryId: 'private', order: 1 }
  ]);

  private notes$ = new BehaviorSubject<Note[]>([
    {
      id: 'n1',
      title: 'Vorhänge',
      content: 'Wohnzimmer & Küche',
      updatedAt: '2025-12-24',
      createdAt: '2025-12-23',
      userID: '1',
      global: true
    },
    {
      id: 'n2',
      title: 'Soundsystem',
      content: 'Wohnung',
      updatedAt: '2025-12-26',
      createdAt: '2025-12-25',
      userID: '1',
      global: true
    },
    {
      id: 'n3',
      title: 'Meeting Notizen',
      content: 'Sprint Review',
      categoryID: 'work',
      updatedAt: '2025-12-22',
      createdAt: '2025-12-21',
      userID: '1',
      global: true
    },
    {
      id: 'n4',
      title: 'API Refactor',
      content: 'Projekt A Tasks',
      categoryID: 'projectA',
      updatedAt: '2025-12-25',
      createdAt: '2025-12-23',
      userID: '1',
      global: true
    },
    {
      id: 'n5',
      title: 'Einkaufsliste',
      content: 'Milch, Brot',
      categoryID: 'shopping',
      updatedAt: '2025-12-20',
      createdAt: '2025-12-20',
      userID: '1',
      global: true
    }
  ]);

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Constructor
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  constructor(private auth: AuthService, private http?: HttpClient) {}

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // API Abfragen 
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getNotes(): Observable<Note[]> {
    if (this.http) {
      return this.http.get<Note[]>(`${environment.apiUrl}/api/notes`);
    }

    return combineLatest([this.notes$, this.auth.user$]).pipe(
      map(([notes, user]) =>
        notes.filter(n => n.global || n.userID === user?.id)
      )
    );
  }

  getCategories(): Observable<NoteCategory[]> {
    if (this.http) {
      return this.http.get<NoteCategory[]>(`${environment.apiUrl}/api/note-categories`);
    }
    return this.categories$.asObservable();
  }

  saveNote(note: Note): Observable<Note> {
    if (this.http) {
      if (note.id) return this.http.put<Note>(`/api/notes/${note.id}`, note);
      else return this.http.post<Note>(`/api/notes`, note);
    } else {
      if (!note.id) note.id = '_' + Math.random().toString(36).substr(2, 9);
      const savedNotes = this.notes$.value.filter(n => n.id !== note.id);
      savedNotes.push(note);
      this.notes$.next(savedNotes);
      return new Observable(sub => { sub.next(note); sub.complete(); });
    }
  }

  deleteNote(id: string): Observable<void> {
    if (this.http) {
      return this.http.delete<void>(`/api/notes/${id}`);
    } else {
      const savedNotes = this.notes$.value.filter(n => n.id !== id);
      this.notes$.next(savedNotes);
      return new Observable(sub => { sub.next(); sub.complete(); });
    }
  }


  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Abfragen für Seite
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getWidgetNotes(): Observable<Note[]> {
    return this.getNotes().pipe(
      map(notes => notes
        .filter(n => !n.categoryID)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      )
    );
  }

  getCategoryTree(): Observable<CategoryNode[]> {
    return combineLatest([this.getNotes(), this.getCategories()]).pipe(
      map(([notes, categories]) => this.buildCategoryTree(categories, notes))
    );
  }

  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  // Hilfsfunktionen
  //////////////////////////////////////////////////////////////////////////////////////////////////////////////////////////
  getVisibleNotes(): Observable<Note[]> {
    return combineLatest([this.notes$, this.auth.user$]).pipe(
      map(([notes, user]) =>
        notes.filter(n => n.global || n.userID === user?.id)
      )
    );
  }

  // Hilfsfunktionen
  private buildCategoryTree(
    categories: NoteCategory[],
    notes: Note[]
  ): CategoryNode[] {
    const map = new Map<string, CategoryNode>();

    categories.forEach(c =>
      map.set(c.id, {
        ...c,
        children: [],
        notes: [],
        expanded: true
      })
    );

    notes.forEach(note => {
      if (note.categoryID && map.has(note.categoryID)) {
        map.get(note.categoryID)!.notes.push(note);
      }
    });

    const roots: CategoryNode[] = [];

    map.forEach(cat => {
      if (cat.parentCategoryId && map.has(cat.parentCategoryId)) {
        map.get(cat.parentCategoryId)!.children.push(cat);
      } else {
        roots.push(cat);
      }
    });

    return roots.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }
}
