import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(file, before, after) {
  const source = readFileSync(file, "utf8");
  if (!source.includes(before)) return false;
  writeFileSync(file, source.replace(before, after));
  return true;
}

replaceOnce(
  "src/screens/FuelChainLibraryScreen.tsx",
  `function newThuFuelLines(link: ReturnType<typeof analyzeChainLinks>[number]) {
  return link.fuelGaps.flatMap((gap) =>
    gap.previousFuel !== null && gap.nextFuel !== null
      ? [
          \`\${uiText.chains.sectionLabel(gap.sectionKey)}: \${formatNumber(
            gap.previousFuel
          )} / \${formatNumber(gap.nextFuel)} кг\`,
        ]
      : []
  );
}

`,
  ""
);

replaceOnce(
  "src/screens/FuelChainLibraryScreen.tsx",
  "  if (!suggestedThu) return newThuFuelLines(link);",
  "  if (!suggestedThu) return [];"
);

replaceOnce(
  "src/screens/FuelChainLibraryScreen.tsx",
  `                      const shouldSuggestNewThu =
                        link?.timeStatus === "gap" &&
                        link.locationStatus === "continuous" &&
                        !canAttachGapToThu(`,
  `                      const shouldSuggestNewThu =
                        link?.timeStatus === "gap" &&
                        link.locationStatus === "continuous" &&
                        buildSuggestedThuForGap(link, chain.tankCapacity) !==
                          null &&
                        !canAttachGapToThu(`
);

replaceOnce(
  "src/components/ChainCorrectionPanel.tsx",
  `    return {
      canExtendPrevious,
      canMoveNext,
      previousTarget:`,
  `    return {
      canExtendPrevious,
      canMoveNext,
      canCreateNewThu: suggestedThu !== null,
      previousTarget:`
);

replaceOnce(
  "src/components/ChainCorrectionPanel.tsx",
  `                {selectedTimeFix.remainingStart &&
                  selectedTimeFix.remainingEnd && (`,
  `                {selectedTimeFix.canCreateNewThu &&
                  selectedTimeFix.remainingStart &&
                  selectedTimeFix.remainingEnd && (`
);
