import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { CategoryNode, Note } from '../model/notes.model';
import { NotesService } from '../service/notes.service';

@Component({
  selector: 'notes-page',
  standalone: true,
  imports: [ CommonModule ],
  templateUrl: './notes.page.html',
  styleUrl: './notes.page.css',
})
export class NotesPage {
  categoryTree: CategoryNode[] = [];
  notes: Note[] = [];

  constructor(private notesService: NotesService) {}

  ngOnInit(): void {
    this.notesService.getCategoryTree().subscribe(tree => {
      this.categoryTree = tree;
    })
  }

  toggle(category: CategoryNode) {
    category.expanded = !category.expanded;
  }
}
