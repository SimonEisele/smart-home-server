/** Missing numeric API values use NaN and are rendered as —, never as zero. */
export interface GeoLocation {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  admin1?: string;
  timezone: string;
}

export interface CurrentWeather {
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  pressure: number;
  windSpeed: number;
  windDirection: number;
  windGusts: number;
  uvIndex: number;
  isDay: boolean;
  time: string;
}

export interface HourlyWeather {
  isDay?: boolean;
  time: string;  // Local time in location.timezone, without Z
  temperature: number;
  apparentTemperature: number;
  humidity: number;
  precipitationProbability: number;
  precipitation: number;
  weatherCode: number;
  cloudCover: number;
  windSpeed: number;
  windDirection: number;
  uvIndex: number;
  visibility: number; // km
}

export interface DailyWeather {
  date: string;          // YYYY-MM-DD
  weatherCode: number;
  tempMax: number;
  tempMin: number;
  apparentTempMax: number;
  apparentTempMin: number;
  sunrise: string;       // ISO datetime without Z
  sunset: string;        // ISO datetime without Z
  precipitationSum: number;
  precipitationHours: number;
  precipitationProbabilityMax: number;
  windSpeedMax: number;
  windGustsMax: number;
  windDirectionDominant: number;
  uvIndexMax: number;
}

export interface WeatherData {
  location: GeoLocation;
  current: CurrentWeather;
  hourly: HourlyWeather[];
  daily: DailyWeather[];
  updatedAt: Date;
}

export interface CitySearchResult {
  id: number;
  name: string;
  latitude: number;
  longitude: number;
  country: string;
  country_code: string;
  timezone: string;
  admin1?: string;
}
