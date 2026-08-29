import { type ReactNode, useId } from "react";

import type { ResearchDefinitionMap } from "./researchDefinitions";

interface ResearchDefinitionTooltipProps {
  definitionKey: string;
  definitions: ResearchDefinitionMap;
  children: ReactNode;
}

function ResearchDefinitionTooltip({
  definitionKey,
  definitions,
  children,
}: ResearchDefinitionTooltipProps) {
  const tooltipId = useId();
  const definition = definitions[definitionKey];

  if (!definition) return children;

  return (
    <span className="research-definition">
      <span
        className="research-definition-trigger"
        tabIndex={0}
        aria-describedby={tooltipId}
      >
        {children}
      </span>
      <span className="research-definition-tooltip" id={tooltipId} role="tooltip">
        <strong>{definition.title}</strong>
        <span>{definition.description}</span>
        {definition.details && (
          <ul>
            {definition.details.map((detail) => <li key={detail}>{detail}</li>)}
          </ul>
        )}
      </span>
    </span>
  );
}

export default ResearchDefinitionTooltip;
