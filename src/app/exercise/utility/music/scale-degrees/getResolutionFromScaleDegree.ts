import * as _ from 'lodash';
import { CadenceType } from 'src/app/exercise/exercises/utility/settings/CadenceTypeSetting';
import { DeepReadonly } from '../../../../shared/ts-utility';
import {
  DiatonicScaleDegree,
  ScaleDegree,
  getDiatonicScaleDegreeWithAccidental,
} from './ScaleDegrees';

interface ScaleOption {
  scale: ScaleDegree[];
  isMajor: boolean;
  rating: number; // the in case of ambiguity, the smaller number prevails
}

const optionsForBottomHalf: DeepReadonly<ScaleOption[]> = [
  {
    scale: ['4', '3', '2', '1'],
    isMajor: true,
    rating: 0,
  },
  {
    scale: ['4', 'b3', '2', '1'],
    isMajor: false,
    rating: 1,
  },
  {
    scale: ['4', 'b3', 'b2', '1'],
    isMajor: false,
    rating: 2,
  },
  {
    scale: ['#4', '3', '2', '1'],
    isMajor: true,
    rating: 3,
  },
];

const optionsForUpperHalf: DeepReadonly<ScaleOption[]> = [
  {
    scale: ['5', '6', '7', '1'], // major
    isMajor: true,
    rating: 0,
  },
  {
    scale: ['5', '6', 'b7', '1'], // mixolydian
    isMajor: true,
    rating: 3,
  },
  {
    scale: ['5', 'b6', '7', '1'], // harmonic minor
    isMajor: false,
    rating: 1,
  },
  {
    scale: ['5', 'b6', 'b7', '1'], // natural minor
    isMajor: false,
    rating: 2,
  },
];

export interface ResolutionOptions {
  /**
   * 'b3' (Me) resolves b3 -> 2 -> 1 instead of going through the natural 3 (b3 -> 3 -> 2 -> 1),
   * and 'b2' (Ra) resolves b2 -> 1 instead of going through the natural 2 (b2 -> 2 -> 1)
   * */
  resolveMeAndRaDirectly?: boolean;
  /**
   * '#4' (Fi) resolves up to the high tonic (#4 -> 5 -> 6 -> 7 -> 1) instead of down
   * */
  resolveFiUp?: boolean;
}

/**
 * Whether the resolution goes up (the last note should then be an octave above)
 * */
export function isResolutionUp(
  scaleDegree: ScaleDegree,
  { resolveFiUp = false }: ResolutionOptions = {},
): boolean {
  return (
    getDiatonicScaleDegreeWithAccidental(scaleDegree).diatonicScaleDegree >=
      5 ||
    (resolveFiUp && scaleDegree === '#4')
  );
}

export function getResolutionFromScaleDegree(
  scaleDegree: ScaleDegree,
  includedNotes: ScaleDegree[],
  cadenceType: CadenceType,
  {
    resolveMeAndRaDirectly = false,
    resolveFiUp = false,
  }: ResolutionOptions = {},
): DeepReadonly<ScaleDegree[]> {
  if (!includedNotes.includes(scaleDegree)) {
    throw new Error(
      `includedNotes (${includedNotes.join(
        ',',
      )}) must include scaleDegree ${scaleDegree}`,
    );
  }

  const defaultScaleOptions =
    getDiatonicScaleDegreeWithAccidental(scaleDegree).diatonicScaleDegree < 5
      ? optionsForBottomHalf
      : optionsForUpperHalf;

  function getScale(
    scaleOptions: DeepReadonly<ScaleOption[]> = defaultScaleOptions,
  ): DeepReadonly<ScaleDegree[]> | null {
    const diatonicDegreeToIncludedNotes = _.groupBy(
      includedNotes,
      (includedNote) =>
        getDiatonicScaleDegreeWithAccidental(includedNote).diatonicScaleDegree,
    );
    const optionsThatWorksWithIncludedNotes = scaleOptions.filter((option) => {
      return _.every(option.scale, (scaleDegreeInScaleCandidate) => {
        const diatonicDegree: DiatonicScaleDegree =
          getDiatonicScaleDegreeWithAccidental(
            scaleDegreeInScaleCandidate,
          ).diatonicScaleDegree;
        return (
          _.isEmpty(diatonicDegreeToIncludedNotes[diatonicDegree]) ||
          diatonicDegreeToIncludedNotes[diatonicDegree].includes(
            scaleDegreeInScaleCandidate,
          )
        );
      });
    });

    if (optionsThatWorksWithIncludedNotes.length === 0) {
      return null;
    }

    // If requested, prefer scales that contain the flat third itself,
    // so the resolution doesn't detour through the natural third
    const optionsContainingScaleDegree =
      resolveMeAndRaDirectly && scaleDegree === 'b3'
        ? optionsThatWorksWithIncludedNotes.filter((option) =>
            option.scale.includes(scaleDegree),
          )
        : [];
    const candidateOptions = optionsContainingScaleDegree.length
      ? optionsContainingScaleDegree
      : optionsThatWorksWithIncludedNotes;

    const optionsThatWorkWithCadenceType: DeepReadonly<ScaleOption>[] =
      candidateOptions.filter((option) =>
        cadenceType === 'I IV V I' ? option.isMajor : !option.isMajor,
      );

    if (_.isEmpty(optionsThatWorkWithCadenceType)) {
      optionsThatWorkWithCadenceType.push(...candidateOptions); // ignoring cadence type if it contradicts
    }

    return _.minBy(optionsThatWorkWithCadenceType, 'rating')!.scale; // we asserted it's not empty before
  }

  if (resolveMeAndRaDirectly && scaleDegree === 'b2') {
    return ['b2', '1']; // doesn't depend on the scale, so also works when included notes conflict with it
  }

  if (resolveFiUp && scaleDegree === '#4') {
    // same path as resolving the 5th, with the #4 in front
    return [
      '#4',
      ...(getScale(optionsForUpperHalf) ?? optionsForUpperHalf[0].scale),
    ];
  }

  const scale = getScale();
  if (!scale) {
    return [];
  }
  const diatonicScaleDegree =
    getDiatonicScaleDegreeWithAccidental(scaleDegree).diatonicScaleDegree;
  const indexToStartFrom: number =
    diatonicScaleDegree <= 4
      ? 4 - diatonicScaleDegree
      : diatonicScaleDegree - 5;
  const clippedScale = [...scale].splice(indexToStartFrom);
  if (!clippedScale.includes(scaleDegree)) {
    // i.e. scaleDegree is outside detected scale
    clippedScale.unshift(scaleDegree);
  }

  return clippedScale;
}
