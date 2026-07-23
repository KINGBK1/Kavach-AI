import React from "react";
import "./Animations.css";

const CardSkeleton = ({ lines = 3 }) => (
  <div className="v-skeleton-card">
    <div className="v-skeleton-line v-skeleton-line--short" />
    <div className="v-skeleton-line v-skeleton-line--medium" />
    {Array.from({ length: lines }).map((_, i) => (
      <div
        key={i}
        className="v-skeleton-line"
        style={{ width: `${60 + Math.random() * 35}%` }}
      />
    ))}
  </div>
);

const MapSkeleton = () => (
  <div className="v-skeleton-map">
    <div className="v-skeleton-map-tile" />
  </div>
);

const TableSkeleton = ({ rows = 5 }) => (
  <div className="v-skeleton-table">
    <div className="v-skeleton-line v-skeleton-line--full" style={{ marginBottom: 16 }} />
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="v-skeleton-row">
        <div className="v-skeleton-line" style={{ width: "20%" }} />
        <div className="v-skeleton-line" style={{ width: "35%" }} />
        <div className="v-skeleton-line" style={{ width: "15%" }} />
        <div className="v-skeleton-line" style={{ width: "15%" }} />
      </div>
    ))}
  </div>
);

export { CardSkeleton, MapSkeleton, TableSkeleton };
