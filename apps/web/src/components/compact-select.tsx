"use client";

import {
  Children,
  Fragment,
  isValidElement,
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";

export type CompactSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type CompactSelectChangeEvent = {
  target: { value: string };
};

type CompactSelectBaseProps = {
  value: string | number;
  "aria-label": string;
  disabled?: boolean;
};

type CompactSelectProps = CompactSelectBaseProps & (
  | { options: CompactSelectOption[]; children?: never; onValueChange: (value: string) => void; onChange?: never }
  | { options?: never; children: ReactNode; onChange: (event: CompactSelectChangeEvent) => void; onValueChange?: never }
);

type OptionElementProps = {
  value?: string | number;
  children?: ReactNode;
  disabled?: boolean;
};

function getOptions(children: ReactNode): CompactSelectOption[] {
  const options: CompactSelectOption[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement<OptionElementProps>(child)) return;
    if (child.type === Fragment) {
      options.push(...getOptions(child.props.children));
      return;
    }
    if (child.type !== "option") return;
    const label = Children.toArray(child.props.children)
      .map((part) => typeof part === "string" || typeof part === "number" ? String(part) : "")
      .join("")
      .trim();
    const value = child.props.value === undefined ? label : String(child.props.value);
    options.push({ value, label, disabled: child.props.disabled });
  });
  return options;
}

export function CompactSelect(props: CompactSelectProps) {
  const { value: rawValue, "aria-label": ariaLabel, disabled = false } = props;
  const value = String(rawValue);
  const options = "options" in props && props.options ? props.options : getOptions(props.children);
  const menuId = useId();
  const firstEnabledIndex = options.findIndex((option) => !option.disabled);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => {
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    return selectedIndex >= 0 ? selectedIndex : Math.max(0, firstEnabledIndex);
  });
  const [opensAbove, setOpensAbove] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [open]);

  useEffect(() => {
    if (open) optionRefs.current[activeIndex]?.focus();
  }, [activeIndex, open]);

  function showOptions() {
    if (disabled || options.length === 0) return;
    const bounds = triggerRef.current?.getBoundingClientRect();
    const spaceBelow = bounds ? window.innerHeight - bounds.bottom : window.innerHeight;
    const spaceAbove = bounds?.top ?? 0;
    setOpensAbove(spaceBelow < 260 && spaceAbove > spaceBelow);
    const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
    setActiveIndex(selectedIndex >= 0 ? selectedIndex : Math.max(0, firstEnabledIndex));
    setOpen(true);
  }

  function selectOption(option: CompactSelectOption) {
    if (option.disabled) return;
    if (props.options) props.onValueChange(option.value);
    else props.onChange({ target: { value: option.value } });
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleOptionKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
      return;
    }
    if (firstEnabledIndex >= 0 && (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End")) {
      event.preventDefault();
      const direction = event.key === "ArrowUp" || event.key === "End" ? -1 : 1;
      if (event.key === "Home" || event.key === "End") {
        let next = event.key === "Home" ? 0 : options.length - 1;
        while (options[next]?.disabled) next += event.key === "Home" ? 1 : -1;
        setActiveIndex(next);
        return;
      }
      let next = activeIndex;
      for (let count = 0; count < options.length; count += 1) {
        next = (next + direction + options.length) % options.length;
        if (!options[next]?.disabled) break;
      }
      setActiveIndex(next);
    }
  }

  return (
    <div className="compact-select" ref={rootRef}>
      <button
        type="button"
        className="compact-select-trigger"
        ref={triggerRef}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        disabled={disabled}
        onClick={() => open ? setOpen(false) : showOptions()}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            if (!open) showOptions();
          }
        }}
      >
        <span>{selected?.label ?? "Choose an option"}</span>
        <ChevronDown size={17} aria-hidden="true" />
      </button>
      {open && (
        <div
          className={`compact-select-menu${opensAbove ? " opens-above" : ""}`}
          id={menuId}
          role="listbox"
          aria-label={ariaLabel}
          onKeyDown={handleOptionKeyDown}
        >
          {options.map((option, index) => (
            <button
              type="button"
              role="option"
              aria-selected={option.value === value}
              className={option.value === value ? "is-selected" : ""}
              disabled={option.disabled}
              key={option.value}
              ref={(element) => { optionRefs.current[index] = element; }}
              tabIndex={activeIndex === index ? 0 : -1}
              onFocus={() => setActiveIndex(index)}
              onClick={() => selectOption(option)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
