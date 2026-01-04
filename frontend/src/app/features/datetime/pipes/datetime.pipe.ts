import { Pipe, PipeTransform } from "@angular/core";

@Pipe({
  name: 'greeting',
  standalone: true,
})
export class GreetingPipe implements PipeTransform {

  transform(date: Date): string {
    const hour = date.getHours();

    if (hour >= 5 && hour < 10) {
      return '🌅 Guten Morgen';
    }
    if (hour >= 10 && hour < 17) {
      return '☀️ Guten Tag';
    }
    if (hour >= 17 && hour < 22) {
      return '🌇 Guten Abend';
    }
    return '🌙 Gute Nacht';
  }
}
