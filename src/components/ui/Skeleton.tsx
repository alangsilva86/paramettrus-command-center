import React from 'react';

export interface SkeletonProps {
  width?: string;
  height?: string;
  className?: string;
  circle?: boolean;
}

const Skeleton: React.FC<SkeletonProps> = ({ width = '100%', height = '16px', className = '', circle = false }) => (
  <span
    className={`relative overflow-hidden rounded ${circle ? 'aspect-square' : ''} ${className}`}
    style={{ width, height }}
  >
    <span
      className="absolute inset-0 animate-pulse bg-gradient-to-r from-white/5 via-white/20 to-white/5"
      aria-hidden="true"
    />
  </span>
);

export default Skeleton;
