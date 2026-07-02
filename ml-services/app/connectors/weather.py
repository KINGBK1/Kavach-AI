from app.models.weather import Weather
import requests
WEATHER_URL = "https://api.open-meteo.com/v1/forecast"

class WeatherConnector:

    def fetch(self, latitude: float, longitude: float):

        response = requests.get(
            WEATHER_URL,
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": [
                    "temperature_2m",
                    "relative_humidity_2m",
                    "precipitation",
                    "rain",
                    "wind_speed_10m",
                    "weather_code",
                ],
            },
            timeout=10,
        )

        response.raise_for_status()

        return self.normalize(response.json())

    def normalize(self, raw):

        current = raw["current"]

        return Weather(
            temperature=current["temperature_2m"],
            humidity=current["relative_humidity_2m"],
            precipitation=current["precipitation"],
            rain=current["rain"],
            wind_speed=current["wind_speed_10m"],
            weather_code=current["weather_code"],
        )