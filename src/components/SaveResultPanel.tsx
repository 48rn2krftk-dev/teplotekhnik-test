import { Save, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { uiText } from "../content";
import type {
  CalculationResult,
  CalculationSource,
  HistoryEntry,
  SlotData,
} from "../types";
import { formatNumber, formatTime } from "../utils/format";
import {
  addHistoryEntry,
  getSettings,
  getSlots,
  saveSlot,
  subscribeSlotsChange,
} from "../utils/storage";

type SaveResultPanelProps = {
  result: CalculationResult | null;
  defaultTitle: string;
  source: CalculationSource | null;
};

export function SaveResultPanel({
  result,
  defaultTitle,
  source,
}: SaveResultPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [slots, setSlots] = useState<Array<SlotData | null>>(() => getSlots());
  const [title, setTitle] = useState(defaultTitle);
  const [message, setMessage] = useState("");

  useEffect(() => {
    return subscribeSlotsChange(() => {
      setSlots(getSlots());
    });
  }, []);

  const filledSlotsCount = useMemo(
    () => slots.filter((slot) => slot !== null).length,
    [slots]
  );

  const visibleSlotIndexes = useMemo(() => {
    const indexes = slots
      .map((slot, index) => (slot ? index : null))
      .filter((index): index is number => index !== null);

    if (filledSlotsCount < 3) {
      indexes.push(filledSlotsCount);
    }

    return indexes;
  }, [slots, filledSlotsCount]);

  function createSavedData(): {
    slot: SlotData;
    history: HistoryEntry;
  } | null {
    if (!result || !source) return null;

    const savedAt = new Date().toISOString();
    const savedTitle = title.trim() || defaultTitle;
    const slot: SlotData = {
      ...result,
      title: savedTitle,
      savedAt,
      source,
    };

    return {
      slot,
      history: {
        ...result,
        id: savedAt,
        title: savedTitle,
        createdAt: savedAt,
        normFuelPerHour: getSettings().normFuelPerHour,
        source,
      },
    };
  }

  function showMessage(text: string) {
    setMessage(text);

    window.setTimeout(() => {
      setMessage("");
    }, 1800);
  }

  function handleOpen() {
    if (!result) return;

    setTitle(defaultTitle);
    setIsOpen(true);
  }

  function handleClose() {
    setIsOpen(false);
  }

  function handleSave(slotIndex: number) {
    const savedData = createSavedData();

    if (!savedData) return;

    const isOverwrite = slots[slotIndex] !== null;

    saveSlot(slotIndex, savedData.slot);
    addHistoryEntry(savedData.history);
    setIsOpen(false);

    showMessage(
      isOverwrite
        ? uiText.saveResult.slotOverwritten(slotIndex + 1)
        : uiText.saveResult.savedToSlot(slotIndex + 1)
    );
  }

  return (
    <div className="savePanel">
      <button
        className="primaryButton saveButton"
        type="button"
        disabled={!result}
        onClick={handleOpen}
      >
        <Save size={18} />
        {uiText.common.save}
      </button>

      {message && <div className="successBox">{message}</div>}

      {isOpen && result && (
        <div className="modalOverlay" onClick={handleClose}>
          <div
            className="modalSheet"
            role="dialog"
            aria-modal="true"
            aria-label={uiText.saveResult.dialogLabel}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modalHeader">
              <div>
                <h2>{uiText.saveResult.title}</h2>
                <p>
                  {filledSlotsCount === 0
                    ? uiText.saveResult.firstSlotDescription
                    : uiText.saveResult.existingSlotsDescription}
                </p>
              </div>

              <button
                className="iconButton"
                type="button"
                onClick={handleClose}
                aria-label={uiText.saveResult.close}
              >
                <X size={20} />
              </button>
            </div>

            <label className="field">
              <span>{uiText.saveResult.nameLabel}</span>
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={uiText.saveResult.namePlaceholder}
                autoFocus
              />
            </label>

            {filledSlotsCount === 0 ? (
              <button
                className="primaryButton fullWidthButton"
                type="button"
                onClick={() => handleSave(0)}
              >
                {uiText.saveResult.saveToSlot(1)}
              </button>
            ) : (
              <div className="slotList">
                {visibleSlotIndexes.map((index) => {
                  const slot = slots[index];

                  return (
                    <button
                      key={index}
                      className="slotButton"
                      type="button"
                      onClick={() => handleSave(index)}
                    >
                      <span className="slotButtonTitle">
                        {slot
                          ? uiText.saveResult.overwriteSlot(index + 1)
                          : uiText.saveResult.saveToNewSlot(index + 1)}
                      </span>

                      {slot ? (
                        <span className="slotButtonMeta">
                          {uiText.saveResult.current}: {slot.title} ·{" "}
                          {formatTime(slot.minutes)} ·{" "}
                          {formatNumber(slot.fuelPerHour)}{" "}
                          {uiText.common.units.kilogramsPerHour}
                        </span>
                      ) : (
                        <span className="slotButtonMeta">
                          {uiText.saveResult.emptySlot}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
