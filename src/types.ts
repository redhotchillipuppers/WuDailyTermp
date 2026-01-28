export interface LocationPoint {
  location: {
    city?: string;
    displayContext?: string;
    ianaTimeZone?: string;
    pwsId?: string;
    countryCode?: string;
  };
}

export interface ObservationsCurrent {
  temperature?: number;
  validTimeUtc?: number;
  validTimeLocal?: string;
  temperatureMax24Hour?: number;
  temperatureMin24Hour?: number;
  relativeHumidity?: number;
  windSpeed?: number;
  windDirectionCardinal?: string;
  pressureMeanSeaLevel?: number;
  wxPhraseLong?: string;
}

export interface CompositeEntry {
  id?: string;
  "v3-location-point"?: LocationPoint;
  "v3-wx-observations-current"?: ObservationsCurrent;
}

export interface DailyHighRecord {
  date_local: string;
  timezone: string;
  samples: number;
  high_temperatureC: number | null;
  high_at_validTimeLocal: string | null;
  last_seen_temperatureC: number | null;
  last_seen_validTimeLocal: string | null;
}
