import { brand } from "@kit/brand";

/**
 * The only place the logo is rendered. Size via className (height; width follows the image, so
 * wide wordmarks keep their shape). The plate is transparent unless the brand sets `logoPlate`.
 */
export function BrandLogo({ className = "h-7" }: { className?: string }) {
  return (
    <span className="inline-flex rounded bg-logo-plate p-0.5">
      <img
        src={brand.logo}
        alt={`${brand.name} logo`}
        className={`w-auto object-contain ${className}`}
      />
    </span>
  );
}
