import { getMark, MARK_STROKE, MARK_VIEWBOX } from '@/lib/marks';

// Inline SVG brand mark. Uses currentColor so it inherits the text colour of
// wherever it sits (taskbar, footer, phone screen). Pass `id` to render a
// specific candidate; defaults to the active mark.
export default function ZephyrMark({ id, size = 20, className, style, title }) {
  const mark = getMark(id);
  return (
    <svg
      className={className}
      style={style}
      width={size}
      height={size}
      viewBox={`0 0 ${MARK_VIEWBOX} ${MARK_VIEWBOX}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={MARK_STROKE}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : 'true'}
      role={title ? 'img' : undefined}
      xmlns="http://www.w3.org/2000/svg"
    >
      {title && <title>{title}</title>}
      {mark.shapes.map(([type, a], i) => {
        if (type === 'path') {
          return <path key={i} d={a.d} strokeWidth={a.strokeWidth} />;
        }
        if (type === 'circle') {
          return a.fill ? (
            <circle key={i} cx={a.cx} cy={a.cy} r={a.r} fill="currentColor" stroke="none" />
          ) : (
            <circle key={i} cx={a.cx} cy={a.cy} r={a.r} strokeWidth={a.strokeWidth} />
          );
        }
        if (type === 'text') {
          return (
            <text
              key={i}
              x={a.x}
              y={a.y}
              fontFamily="'Times New Roman', Times, serif"
              fontStyle="italic"
              fontSize={a.size}
              textAnchor="middle"
              fill="currentColor"
              stroke="none"
            >
              {a.text}
            </text>
          );
        }
        return null;
      })}
    </svg>
  );
}
