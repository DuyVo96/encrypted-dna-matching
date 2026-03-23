'use client';

import { Check } from 'lucide-react';
import { useDnaStore } from '@/store/dnaStore';
import type { AppStep } from '@/types/dna';

const STEPS: { id: AppStep; label: string; sublabel: string }[] = [
  { id: 'upload', label: 'Encrypt & Register', sublabel: 'Upload your DNA' },
  { id: 'match',  label: 'Request Match',       sublabel: 'Find a partner'   },
  { id: 'result', label: 'View Results',         sublabel: 'Similarity score' },
];

export function StepIndicator() {
  const { currentStep, setCurrentStep, myProfile } = useDnaStore();

  const currentIdx = STEPS.findIndex((s) => s.id === currentStep);

  function canNavigateTo(stepId: AppStep): boolean {
    if (stepId === 'upload') return true;
    if (stepId === 'match')  return !!myProfile?.isRegistered;
    if (stepId === 'result') return !!myProfile?.isRegistered;
    return false;
  }

  return (
    <div className="flex items-center justify-center gap-0">
      {STEPS.map((step, idx) => {
        const isActive    = step.id === currentStep;
        const isCompleted = idx < currentIdx;
        const isClickable = canNavigateTo(step.id) && !isActive;

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => isClickable && setCurrentStep(step.id)}
              disabled={!canNavigateTo(step.id)}
              className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl transition-all duration-200 ${
                isActive
                  ? 'cursor-default'
                  : isClickable
                  ? 'cursor-pointer hover:opacity-80'
                  : 'cursor-not-allowed opacity-40'
              }`}
            >
              {/* Circle */}
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all duration-200 ${
                  isCompleted
                    ? 'border-dao-yes bg-dao-yes'
                    : isActive
                    ? 'border-dao-primary bg-dao-primary animate-glow-pulse'
                    : 'border-dao-text-muted/30 bg-transparent'
                }`}
              >
                {isCompleted ? (
                  <Check size={16} className="text-white" />
                ) : (
                  <span
                    className={`text-sm font-bold ${
                      isActive ? 'text-white' : 'text-dao-text-muted'
                    }`}
                  >
                    {idx + 1}
                  </span>
                )}
              </div>

              {/* Label */}
              <div className="text-center">
                <div
                  className={`text-xs font-semibold ${
                    isActive ? 'text-dao-text' : 'text-dao-text-muted'
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-xs text-dao-text-muted hidden sm:block">
                  {step.sublabel}
                </div>
              </div>
            </button>

            {/* Connector */}
            {idx < STEPS.length - 1 && (
              <div
                className={`h-px w-12 sm:w-20 mx-1 transition-colors duration-300 ${
                  idx < currentIdx ? 'bg-dao-yes/60' : 'bg-dao-border'
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
