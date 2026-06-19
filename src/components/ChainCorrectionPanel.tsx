import { RotateCcw, Save, Wand2, X } from "lucide-react";
import { useMemo, useState } from "react";
import { NormComparison } from "./NormComparison";
import { uiText } from "../content";
import type {
  FuelChain,
  FuelChainCorrection,
} from "../domain/documents";
import {
  analyzeChainLinks,
  calculateChainHotIdle,
  getChainDocumentEnd,
  getChainDocumentStart,
  sectionKey,
  sortChainDocuments,
  type ChainLinkAnalysis,
  type ChainDocument,
} from "../utils/chainAnalysis";
import {
  applyChainCorrections,
  buildSuggestedThuForGap,
  buildChainCorrectionScenarios,
  buildChainCorrections,
  cloneChainDocuments,
  validateCorrectedChain,
} from "../utils/chainCorrections";
import { formatNumber, formatTime } from "../utils/format";
import { calculateDriverRouteTaxation } from "../utils/driverRouteCalculations";

type ChainCorrectionPanelProps = {
  chain: FuelChain;
  documents: ChainDocument[];
  normFuelPerHour: number | null;
  onCancel: () => void;
  onSave: (
    corrections: FuelChainCorrection[],
    correctedDocuments: ChainDocument[]
  ) => Promise<void>;
};

function documentKey(item: ChainDocument): string {
  return `${item.type}:${item.document.id}`;
}

function documentTitle(item: ChainDocument): string {
  return item.type === "thu"
    ? `ТХУ-3 № ${item.document.documentNumber}`
    : `ММ № ${item.document.routeNumber}`;
}

function compactDocumentTitle(item: ChainDocument): string {
  return item.type === "thu"
    ? `ТХУ ${item.document.documentNumber}`
    : `ММ ${item.document.routeNumber}`;
}

function formatDateTimeInput(value: string): string {
  return value.slice(0, 16);
}

function formatDateTimeFromMs(value: number): string {
  const date = new Date(value);
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function hasChainLinkIssue(link: ChainLinkAnalysis | undefined): boolean {
  return Boolean(
    link &&
      (link.timeStatus !== "continuous" ||
        link.locationStatus !== "continuous" ||
        link.fuelGaps.some((gap) => gap.status !== "continuous"))
  );
}

function getChainLinkIssueType(
  link: ChainLinkAnalysis | undefined
): "time" | "location" | "fuel" | null {
  if (!link) return null;
  if (link.timeStatus !== "continuous") return "time";
  if (link.locationStatus !== "continuous") return "location";
  if (link.fuelGaps.some((gap) => gap.status !== "continuous")) return "fuel";
  return null;
}

function calculateRouteBalance(items: ChainDocument[]): number {
  return items.reduce(
    (sum, item) =>
      item.type === "driverRoute" ? sum + item.document.creditedResult : sum,
    0
  );
}

function routeBalanceText(value: number): string {
  if (Math.abs(value) < 0.000001) return `${uiText.mmLibrary.zero}: 0 кг`;

  return value > 0
    ? `${uiText.mmLibrary.economy}: ${formatNumber(value)} кг`
    : `${uiText.mmLibrary.overrun}: ${formatNumber(Math.abs(value))} кг`;
}

export function ChainCorrectionPanel({
  chain,
  documents,
  normFuelPerHour,
  onCancel,
  onSave,
}: ChainCorrectionPanelProps) {
  const originals = useMemo(
    () => sortChainDocuments(cloneChainDocuments(documents)),
    [documents]
  );
  const [corrected, setCorrected] = useState(() =>
    sortChainDocuments(applyChainCorrections(documents, chain.corrections))
  );
  const [error, setError] = useState("");
  const [selectedLinkIndex, setSelectedLinkIndex] = useState(0);

  const links = analyzeChainLinks(corrected);
  const issueLinkIndexes = links.flatMap((link, index) =>
    hasChainLinkIssue(link) ? [index] : []
  );
  const effectiveSelectedLinkIndex = issueLinkIndexes.includes(
    selectedLinkIndex
  )
    ? selectedLinkIndex
    : issueLinkIndexes[0] ?? selectedLinkIndex;
  const selectedLink = links[effectiveSelectedLinkIndex] ?? null;
  const hotIdleBefore = calculateChainHotIdle(originals);
  const hotIdleAfter = calculateChainHotIdle(corrected);
  const routeBalanceBefore = calculateRouteBalance(originals);
  const routeBalanceAfter = calculateRouteBalance(corrected);
  const routeBalanceDelta = routeBalanceAfter - routeBalanceBefore;
  const corrections = buildChainCorrections(originals, corrected);
  const scenarios = useMemo(
    () => buildChainCorrectionScenarios(originals, chain.tankCapacity),
    [chain.tankCapacity, originals]
  );
  const instructionCards = useMemo(() => {
    const cards: Array<{
      title: string;
      rows: Array<{
        label: string;
        before: string;
        after: string;
      }>;
    }> = [];

    for (const item of corrected) {
      const original = originals.find(
        (entry) => documentKey(entry) === documentKey(item)
      );
      const title = documentTitle(item);
      const rows: Array<{
        label: string;
        before: string;
        after: string;
      }> = [];

      if (!original) {
        if (item.type === "thu") {
          rows.push({
            label: "Создать",
            before: uiText.common.emptyValue,
            after: `${formatDateTimeInput(item.document.operationStart).replace(
              "T",
              " "
            )}–${formatDateTimeInput(item.document.operationEnd).replace(
              "T",
              " "
            )}`,
          });
        }

        for (const section of item.document.sections) {
          rows.push({
            label: uiText.chains.sectionLabel(sectionKey(section)),
            before: uiText.common.emptyValue,
            after: `${formatNumber(section.fuelAtStart)} / ${formatNumber(
              section.fuelAtEnd
            )} кг`,
          });
        }

        if (rows.length > 0) cards.push({ title, rows });
        continue;
      }

      if (item.type === "thu" && original.type === "thu") {
        if (
          item.document.operationStart !==
            original.document.operationStart ||
          item.document.operationEnd !== original.document.operationEnd
        ) {
          rows.push({
            label: "Время",
            before: `${formatDateTimeInput(
              original.document.operationStart
            ).replace("T", " ")}–${formatDateTimeInput(
              original.document.operationEnd
            ).replace("T", " ")}`,
            after: `${formatDateTimeInput(
              item.document.operationStart
            ).replace("T", " ")}–${formatDateTimeInput(
              item.document.operationEnd
            ).replace("T", " ")}`,
          });
        }
      }

      for (const section of item.document.sections) {
        const sourceSection = original.document.sections.find(
          (entry) => sectionKey(entry) === sectionKey(section)
        );
        if (
          !sourceSection ||
          (sourceSection.fuelAtStart === section.fuelAtStart &&
            sourceSection.fuelAtEnd === section.fuelAtEnd)
        ) {
          continue;
        }

        rows.push({
          label: uiText.chains.sectionLabel(sectionKey(section)),
          before: `${formatNumber(sourceSection.fuelAtStart)} / ${formatNumber(
            sourceSection.fuelAtEnd
          )} кг`,
          after: `${formatNumber(section.fuelAtStart)} / ${formatNumber(
            section.fuelAtEnd
          )} кг`,
        });
      }

      if (rows.length > 0) cards.push({ title, rows });
    }

    return cards;
  }, [corrected, originals]);

  const selectedProblemRows = (() => {
    if (!selectedLink) return [];

    const rows: Array<{
      title: string;
      before: string;
      after: string;
    }> = [];

    if (selectedLink.timeStatus === "gap") {
      rows.push({
        title: uiText.chains.neededTime,
        before: formatDateTimeInput(
          selectedLink.previous.type === "thu"
            ? selectedLink.previous.document.operationEnd
            : selectedLink.previous.document.routeEnd
        ).replace("T", " "),
        after: formatDateTimeInput(
          selectedLink.next.type === "thu"
            ? selectedLink.next.document.operationStart
            : selectedLink.next.document.routeStart
        ).replace("T", " "),
      });
    }

    for (const gap of selectedLink.fuelGaps) {
      if (
        gap.status !== "gap" ||
        gap.previousFuel === null ||
        gap.nextFuel === null
      ) {
        continue;
      }

      rows.push({
        title: `${uiText.chains.neededFuel}: ${uiText.chains.sectionLabel(
          gap.sectionKey
        )}`,
        before: `${formatNumber(gap.previousFuel)} кг`,
        after: `${formatNumber(gap.nextFuel)} кг`,
      });
    }

    return rows;
  })();

  const selectedTimeFix = (() => {
    if (!selectedLink || selectedLink.timeStatus !== "gap") return null;

    const previousEndMs = new Date(getChainDocumentEnd(selectedLink.previous)).getTime();
    const nextStartMs = new Date(getChainDocumentStart(selectedLink.next)).getTime();
    const previousExtensionEndMs =
      selectedLink.previous.type === "thu"
        ? Math.min(
            nextStartMs,
            new Date(selectedLink.previous.document.shiftEnd).getTime()
          )
        : previousEndMs;
    const nextExtensionStartMs =
      selectedLink.next.type === "thu"
        ? Math.max(
            previousEndMs,
            new Date(selectedLink.next.document.shiftStart).getTime()
          )
        : nextStartMs;
    const canExtendPrevious =
      selectedLink.previous.type === "thu" &&
      previousExtensionEndMs > previousEndMs;
    const canMoveNext =
      selectedLink.next.type === "thu" &&
      nextExtensionStartMs < nextStartMs;
    const remainingStartMs = canExtendPrevious
      ? previousExtensionEndMs
      : previousEndMs;
    const remainingEndMs = canMoveNext ? nextExtensionStartMs : nextStartMs;
    const suggestedThu = buildSuggestedThuForGap(selectedLink, chain.tankCapacity);
    const newThuFuelRows = (suggestedThu?.document.sections ?? []).map(
      (section) => ({
        section: uiText.chains.sectionLabel(sectionKey(section)),
        start: formatNumber(section.fuelAtStart),
        end: formatNumber(section.fuelAtEnd),
      })
    );

    return {
      canExtendPrevious,
      canMoveNext,
      previousTarget: formatDateTimeFromMs(previousExtensionEndMs),
      nextTarget: formatDateTimeFromMs(nextExtensionStartMs),
      remainingStart:
        remainingStartMs < remainingEndMs
          ? formatDateTimeFromMs(remainingStartMs)
          : null,
      remainingEnd:
        remainingStartMs < remainingEndMs
          ? formatDateTimeFromMs(remainingEndMs)
          : null,
      station:
        selectedLink.locationStatus === "continuous"
          ? selectedLink.previousLocation
          : null,
      newThuFuelRows,
    };
  })();

  const selectedFuelFixes = (() => {
    if (!selectedLink) return [];

    return selectedLink.fuelGaps.flatMap((gap) => {
      if (
        gap.status !== "gap" ||
        gap.previousFuel === null ||
        gap.nextFuel === null
      ) {
        return [];
      }

      const previousSection = selectedLink.previous.document.sections.find(
        (section) => sectionKey(section) === gap.sectionKey
      );
      const nextSection = selectedLink.next.document.sections.find(
        (section) => sectionKey(section) === gap.sectionKey
      );

      if (!previousSection || !nextSection) return [];

      return [
        {
          sectionKey: gap.sectionKey,
          sectionLabel: uiText.chains.sectionLabel(gap.sectionKey),
          previousFuel: gap.previousFuel,
          nextFuel: gap.nextFuel,
          previousDoc: selectedLink.previous,
          nextDoc: selectedLink.next,
        },
      ];
    });
  })();

  function updateThuTime(
    key: string,
    field: "operationStart" | "operationEnd",
    value: string
  ) {
    setCorrected((items) =>
      items.map((item) =>
        documentKey(item) === key && item.type === "thu"
          ? {
              ...item,
              document: {
                ...item.document,
                [field]: value,
              },
            }
          : item
      )
    );
  }

  function updateFuel(
    key: string,
    targetSectionKey: string,
    field: "fuelAtStart" | "fuelAtEnd",
    value: number
  ) {
    if (!Number.isFinite(value)) return;

    setCorrected((items) =>
      items.map((item) => {
        if (documentKey(item) !== key) return item;

        const sections = item.document.sections.map((section) => {
          if (sectionKey(section) !== targetSectionKey) return section;

          if (
            item.type === "thu" &&
            item.document.operationType === "fueling" &&
            section.fuelAdded !== null
          ) {
            return field === "fuelAtStart"
              ? {
                  ...section,
                  fuelAtStart: value,
                  fuelAtEnd: value + section.fuelAdded,
                }
              : {
                  ...section,
                  fuelAtStart: value - section.fuelAdded,
                  fuelAtEnd: value,
                };
          }

          return { ...section, [field]: value };
        });

        if (item.type === "thu") {
          return {
            ...item,
            document: { ...item.document, sections },
          };
        }

        const actualFuel = sections.reduce(
          (sum, section) =>
            sum + section.fuelAtStart - section.fuelAtEnd,
          0
        );
        const taxation = calculateDriverRouteTaxation(
          item.document.normFuel ?? actualFuel,
          actualFuel,
          item.document.isZeroRoute
        );

        return {
          ...item,
          document: {
            ...item.document,
            sections,
            normFuel: taxation?.normFuel ?? item.document.normFuel,
            actualFuel,
            creditedResult:
              taxation?.creditedResult ?? item.document.creditedResult,
          },
        };
      })
    );
  }

  async function handleSave() {
    const validationError = validateCorrectedChain(
      corrected,
      chain.tankCapacity
    );
    if (validationError) {
      setError(validationError);
      return;
    }

    setError("");
    await onSave(corrections, corrected);
  }

  return (
    <div className="correctionPanel">
      <div className="documentFormHeader">
        <div>
          <h3>{uiText.chains.correctionTitle}</h3>
          <p>{uiText.chains.correctionDescription}</p>
        </div>
        <button
          className="iconButton"
          type="button"
          aria-label={uiText.chains.cancel}
          onClick={onCancel}
        >
          <X size={19} />
        </button>
      </div>

      <div className="correctionFocus">
        <h3>{uiText.chains.correctionFocusTitle}</h3>
        <div className="correctionFocusFlow">
          {corrected.map((item, index) => {
            const link = links[index];
            const hasIssue = hasChainLinkIssue(link);
            const issueType = getChainLinkIssueType(link);
            const breakClassName = [
              "correctionFocusBreak",
              hasIssue ? "hasIssue" : "",
              issueType ? `${issueType}Issue` : "",
              index === effectiveSelectedLinkIndex && hasIssue ? "active" : "",
            ]
              .filter(Boolean)
              .join(" ");

            return (
              <div className="correctionFocusGroup" key={documentKey(item)}>
                <div className="correctionFocusDoc">
                  {compactDocumentTitle(item)}
                </div>
                {link && (
                  <button
                    type="button"
                    onClick={() => setSelectedLinkIndex(index)}
                    className={breakClassName}
                  >
                    {hasIssue ? "!" : "→"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="selectedBreakCard">
        <h3>{uiText.chains.selectedBreakTitle}</h3>
        {selectedProblemRows.length === 0 ? (
          <p>{uiText.chains.noSelectedBreak}</p>
        ) : (
          <>
            <div className="selectedBreakRows">
              {selectedProblemRows.map((row) => (
                <div className="selectedBreakRow" key={row.title}>
                  <b>{row.title}</b>
                  <span>{row.before}</span>
                  <span>→</span>
                  <span>{row.after}</span>
                </div>
              ))}
            </div>

            {selectedLink && selectedTimeFix && (
              <div className="timeFixActions">
                {selectedTimeFix.canExtendPrevious &&
                  selectedLink.previous.type === "thu" && (
                    <label className="timeFixAction">
                      <span>
                        Забрать в {documentTitle(selectedLink.previous)}
                      </span>
                      <input
                        type="datetime-local"
                        value={formatDateTimeInput(
                          selectedLink.previous.document.operationEnd
                        )}
                        max={formatDateTimeInput(
                          selectedLink.previous.document.shiftEnd
                        )}
                        onChange={(event) =>
                          updateThuTime(
                            documentKey(selectedLink.previous),
                            "operationEnd",
                            event.target.value
                          )
                        }
                      />
                      <small>
                        Можно довести до {selectedTimeFix.previousTarget.replace(
                          "T",
                          " "
                        )}
                      </small>
                    </label>
                  )}

                {selectedTimeFix.canMoveNext &&
                  selectedLink.next.type === "thu" && (
                    <label className="timeFixAction">
                      <span>
                        Забрать в {documentTitle(selectedLink.next)}
                      </span>
                      <input
                        type="datetime-local"
                        value={formatDateTimeInput(
                          selectedLink.next.document.operationStart
                        )}
                        min={formatDateTimeInput(
                          selectedLink.next.document.shiftStart
                        )}
                        onChange={(event) =>
                          updateThuTime(
                            documentKey(selectedLink.next),
                            "operationStart",
                            event.target.value
                          )
                        }
                      />
                      <small>
                        Можно начать с {selectedTimeFix.nextTarget.replace(
                          "T",
                          " "
                        )}
                      </small>
                    </label>
                  )}

                {selectedTimeFix.remainingStart &&
                  selectedTimeFix.remainingEnd && (
                    <div className="newThuInstruction">
                      <b>{uiText.chains.newThuForGap}</b>
                      <span>
                        Ввести ТХУ-3 с{" "}
                        {selectedTimeFix.remainingStart.replace("T", " ")} до{" "}
                        {selectedTimeFix.remainingEnd.replace("T", " ")}
                        {selectedTimeFix.station
                          ? `, станция ${selectedTimeFix.station}`
                          : ""}.
                      </span>
                      {selectedTimeFix.newThuFuelRows.map((row) => (
                        <small key={row.section}>
                          {row.section}: приёмка {row.start} кг, сдача{" "}
                          {row.end} кг
                        </small>
                      ))}
                    </div>
                  )}
              </div>
            )}

            {selectedFuelFixes.length > 0 && (
              <div className="fuelFixActions">
                {selectedFuelFixes.map((fix) => (
                  <div className="fuelFixAction" key={fix.sectionKey}>
                    <b>{fix.sectionLabel}</b>
                    <label>
                      <span>
                        Сдача в {documentTitle(fix.previousDoc)}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={fix.previousFuel}
                        onChange={(event) =>
                          updateFuel(
                            documentKey(fix.previousDoc),
                            fix.sectionKey,
                            "fuelAtEnd",
                            event.target.valueAsNumber
                          )
                        }
                      />
                      <small>
                        Чтобы совпало со следующим:{" "}
                        {formatNumber(fix.nextFuel)} кг
                      </small>
                    </label>
                    <label>
                      <span>
                        Приёмка в {documentTitle(fix.nextDoc)}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={fix.nextFuel}
                        onChange={(event) =>
                          updateFuel(
                            documentKey(fix.nextDoc),
                            fix.sectionKey,
                            "fuelAtStart",
                            event.target.valueAsNumber
                          )
                        }
                      />
                      <small>
                        Чтобы совпало с предыдущим:{" "}
                        {formatNumber(fix.previousFuel)} кг
                      </small>
                    </label>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="correctionScenarios">
        <div className="correctionScenariosTitle">
          <Wand2 size={18} />
          <h3>{uiText.chains.scenariosTitle}</h3>
        </div>
        <div className="scenarioGrid">
          {scenarios.map((scenario) => {
            const scenarioText = uiText.chains.scenarios[scenario.id];
            const disabled =
              scenario.changedCount === 0 || scenario.validationError !== null;

            return (
              <button
                className="scenarioButton"
                type="button"
                key={scenario.id}
                disabled={disabled}
                title={scenario.validationError ?? scenarioText.description}
                onClick={() => {
                  setCorrected(scenario.documents);
                  setError("");
                }}
              >
                <b>{scenarioText.title}</b>
                <span>{scenarioText.description}</span>
                <small>
                  {scenario.validationError
                    ? uiText.chains.scenarioUnavailable
                    : uiText.chains.scenarioChanges(scenario.changedCount)}
                </small>
              </button>
            );
          })}
        </div>
      </div>

      {(hotIdleBefore || hotIdleAfter) && (
        <div className="hotIdleComparison">
          <h3>{uiText.chains.hotIdle}</h3>
          {hotIdleBefore && (
            <span>
              {uiText.chains.before}: {formatTime(hotIdleBefore.minutes)} ·{" "}
              {formatNumber(hotIdleBefore.fuelPerHour)} кг/ч
            </span>
          )}
          {hotIdleAfter && (
            <>
              <span>
                {uiText.chains.after}: {formatTime(hotIdleAfter.minutes)} ·{" "}
                {formatNumber(hotIdleAfter.fuelPerHour)} кг/ч
              </span>
              <NormComparison
                result={hotIdleAfter}
                normFuelPerHour={normFuelPerHour}
              />
            </>
          )}
          <div className="routeBalanceComparison">
            <b>{uiText.mmLibrary.taxationResult}</b>
            <span>
              {uiText.chains.before}: {routeBalanceText(routeBalanceBefore)}
            </span>
            <span>
              {uiText.chains.after}: {routeBalanceText(routeBalanceAfter)}
            </span>
            <span
              className={
                routeBalanceDelta >= -0.000001 ? "good" : "bad"
              }
            >
              Изменение: {routeBalanceDelta >= -0.000001 ? "+" : ""}
              {formatNumber(routeBalanceDelta)} кг
            </span>
          </div>
        </div>
      )}

      <div className="paperInstructions">
        <h3>{uiText.chains.paperInstructions}</h3>
        {instructionCards.length === 0 ? (
          <p>{uiText.chains.noCorrections}</p>
        ) : (
          <div className="paperInstructionCards">
            {instructionCards.map((card) => (
              <div className="paperInstructionCard" key={card.title}>
                <b>{card.title}</b>
                {card.rows.map((row) => (
                  <div
                    className="paperInstructionRow"
                    key={`${card.title}-${row.label}`}
                  >
                    <span>{row.label}</span>
                    <del>{row.before}</del>
                    <strong>{row.after}</strong>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <div className="errorBox">{error}</div>}

      <div className="documentFormActions">
        <button
          className="primaryButton inlineButton"
          type="button"
          onClick={() => void handleSave()}
        >
          <Save size={18} />
          {uiText.chains.saveDraft}
        </button>
        <button
          className="secondaryButton compact inlineButton"
          type="button"
          onClick={() =>
            setCorrected(sortChainDocuments(cloneChainDocuments(originals)))
          }
        >
          <RotateCcw size={18} />
          {uiText.chains.resetDraft}
        </button>
      </div>
    </div>
  );
}
