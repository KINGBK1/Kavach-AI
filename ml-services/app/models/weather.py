from pydantic import BaseModel


class Weather(BaseModel):
    temperature: float
    humidity: int
    precipitation: float
    rain: float
    wind_speed: float
    weather_code: int