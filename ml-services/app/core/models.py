from datetime import datetime

from sqlalchemy import (
    Column,
    DateTime,
    Float,
    Integer,
    String,
    Text,
    func,
)
from sqlalchemy.orm import declarative_base

Base = declarative_base()


class IncidentModel(Base):
    __tablename__ = "incidents"

    id = Column(String, primary_key=True)
    source = Column(String, nullable=False, index=True)
    title = Column(Text, nullable=False)
    description = Column(Text)
    category = Column(String, index=True)
    latitude = Column(Float)
    longitude = Column(Float)
    severity = Column(String, index=True)
    timestamp = Column(DateTime(timezone=True), index=True)
    url = Column(Text)
    location = Column(Text, index=True)
    country = Column(String, index=True)
    inserted_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class AnalysisModel(Base):
    __tablename__ = "analyses"

    incident_id = Column(String, primary_key=True)
    incident_type = Column(String)
    severity = Column(String)
    priority_score = Column(Integer, index=True)
    confidence = Column(Float)
    summary = Column(Text)
    recommended_actions = Column(Text)
    model = Column(String)
    processing_time_ms = Column(Integer)
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)


class AnalysisHistoryModel(Base):
    __tablename__ = "analysis_history"

    id = Column(Integer, primary_key=True, autoincrement=True)
    incident_id = Column(String, nullable=False, index=True)
    incident_type = Column(String)
    severity = Column(String)
    priority_score = Column(Integer)
    confidence = Column(Float)
    summary = Column(Text)
    recommended_actions = Column(Text)
    model = Column(String)
    processing_time_ms = Column(Integer)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
