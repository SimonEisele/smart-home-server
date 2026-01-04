export interface CurrentWeather {
  temperature: number;
  weatherCode: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
}

export interface HourlyWeather {
  date: string;
  time: string;
  temperature: number;
  weatherCode: number;
  precipitation: number;
  windSpeed: number;
  windDirection: number;
}

export interface DailyWeather {
  date: string;
  minTemperature: number;
  maxTemperature: number;
  weatherCode: number;
  precipitation: number;
}

export interface WeatherData {
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
}