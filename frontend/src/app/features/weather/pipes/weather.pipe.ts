import { Pipe, PipeTransform } from '@angular/core';

@Pipe({ name: 'weatherLabel' })
export class WeatherLabelPipe implements PipeTransform {
  transform(code: number): string {
    switch(code) {
      case 0: return 'Klar';
      case 1: return 'Teilweise bewölkt';
      case 2: return 'Bewölkt';
      case 3: return 'Regen';
      case 45: return 'Nebel';
      case 61: return 'Leichter Regen';
      case 63: return 'Mäßiger Regen';
      case 65: return 'Starker Regen';
      case 71: return 'Leichter Schneefall';
      default: return 'Unbekannt';
    }
  }
}

@Pipe({ name: 'weatherIcon' })
export class WeatherIconPipe implements PipeTransform {
  transform(code: number): string {
    switch(code) {
      case 0: return '☀️';
      case 1: return '🌤️';
      case 2: return '☁️';
      case 3: return '🌧️';
      case 45: return '🌫️';
      case 61: return '🌦️';
      case 63: return '🌧️';
      case 65: return '⛈️';
      case 71: return '❄️';
      default: return '❓';
    }
  }
}