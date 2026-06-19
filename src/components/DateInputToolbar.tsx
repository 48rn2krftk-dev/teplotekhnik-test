import type { PointerEvent } from "react";

type DateInputToolbarProps = {
  hidden?: boolean;
  onInsert: (value: string) => void;
};

export function DateInputToolbar({
  hidden,
  onInsert,
}: DateInputToolbarProps) {
  if (hidden) return null;

  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
  }

  return (
    <div className="dateInputToolbar" aria-label="Быстрый ввод даты и времени">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Добавить точку"
        onPointerDown={handlePointerDown}
        onClick={() => onInsert(".")}
      >
        .
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Добавить пробел"
        onPointerDown={handlePointerDown}
        onClick={() => onInsert(" ")}
      >
        ␠
      </button>
      <button
        type="button"
        tabIndex={-1}
        aria-label="Добавить двоеточие"
        onPointerDown={handlePointerDown}
        onClick={() => onInsert(":")}
      >
        :
      </button>
    </div>
  );
}
