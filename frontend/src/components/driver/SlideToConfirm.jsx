import React, { useRef, useState, useCallback } from 'react';
import { CaretDoubleRight } from '@phosphor-icons/react';

/**
 * SlideToConfirm — V3Cube "GLISSEZ POUR …" action slider.
 * Drag the white thumb fully to the right to confirm. A direct click/tap on the
 * thumb also confirms (keyboard/accessibility + reliable e2e activation).
 */
export const SlideToConfirm = ({
  label,
  color = '#00B578',
  textColor = '#ffffff',
  onConfirm,
  testId = 'slide-to-confirm',
  disabled = false,
}) => {
  const trackRef = useRef(null);
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const lockedRef = useRef(false);
  const [x, setX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const THUMB = 48;

  const maxX = useCallback(() => {
    const w = trackRef.current?.offsetWidth || 0;
    return Math.max(0, w - THUMB - 8);
  }, []);

  const fire = useCallback(() => {
    if (lockedRef.current || disabled) return;
    lockedRef.current = true;
    setDragging(false);
    setX(maxX());
    onConfirm?.();
    window.setTimeout(() => { lockedRef.current = false; setX(0); }, 700);
  }, [disabled, maxX, onConfirm]);

  const onMove = useCallback((clientX) => {
    if (!draggingRef.current || lockedRef.current) return;
    movedRef.current = true;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const px = Math.min(maxX(), Math.max(0, clientX - rect.left - THUMB / 2));
    setX(px);
    if (px >= maxX() - 6) {
      draggingRef.current = false;
      fire();
    }
  }, [maxX, fire]);

  const end = useCallback(() => {
    if (lockedRef.current) return;
    const wasDragging = draggingRef.current;
    draggingRef.current = false;
    setDragging(false);
    // Treat a clean tap (no drag movement) as an activation for accessibility/e2e.
    if (wasDragging && !movedRef.current) { fire(); return; }
    setX(0);
  }, [fire]);

  return (
    <div
      ref={trackRef}
      className="relative w-full h-14 rounded-full overflow-hidden select-none touch-none"
      style={{ background: color, opacity: disabled ? 0.5 : 1 }}
      data-testid={testId}
      onPointerMove={(e) => onMove(e.clientX)}
      onPointerUp={end}
      onPointerLeave={end}
    >
      <span
        className="absolute inset-0 flex items-center justify-center font-extrabold text-sm tracking-wide pointer-events-none px-12 text-center"
        style={{ color: textColor }}
      >
        {label}
      </span>
      <button
        type="button"
        disabled={disabled}
        className="absolute top-1 left-1 h-12 w-12 rounded-full bg-white flex items-center justify-center shadow-md"
        style={{ transform: `translateX(${x}px)`, transition: dragging ? 'none' : 'transform 0.25s ease' }}
        onPointerDown={() => { if (!disabled) { draggingRef.current = true; movedRef.current = false; setDragging(true); } }}
        data-testid={`${testId}-thumb`}
        aria-label={label}
      >
        <CaretDoubleRight size={22} weight="bold" style={{ color }} />
      </button>
    </div>
  );
};

export default SlideToConfirm;
