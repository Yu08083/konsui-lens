(function (scope) {
  'use strict';
  const safeImagePath = /^\.\/faces\/[A-Za-z0-9_-]+\.(?:png|webp)$/;
  function generate(mapping, profile) {
    const result = mapping?.imageCalibration;
    const measured = result?.measurement;
    const sameArray = (value,expected) => Array.isArray(value) && value.length === expected.length && value.every((item,i)=>item===expected[i]);
    const directlyVerified = (profile?.id === 'yw2-shinuchi-jp' ||
      profile?.validation?.nativeVariantImageBatchVerified === true && result?.variantNativeImageVerified === true) &&
      result?.nativeFaceDetectorVerified === true && result?.shootGateVerified === true;
    const sharedVerified = ['yw2-ganso-jp-base','yw2-honke-jp-base','yw2-ganso-jp-update','yw2-honke-jp-update'].includes(profile?.id) &&
      result?.cameraProcessingEquivalent === true && result.nativeFaceDetectorVerified === false &&
      result.variantNativeImageVerified === false && result.shootGateVerified === false;
    const sameYokai = code => Number.isInteger(code) && Number.isInteger(mapping?.charaId) &&
      Array.isArray(profile?.mappings) && profile.mappings.some(row => row.code === code && row.charaId === mapping.charaId);
    const valid = (directlyVerified || sharedVerified) && result?.matched === true &&
      sameYokai(result.measuredCode) && result.guideAdmission === true &&
      result.historySamples >= 4 && sameYokai(result.historyMeasuredCode) &&
      safeImagePath.test(result.imagePath || '') && Array.isArray(result.featureValues) &&
      result.featureValues.length === 9 && result.featureValues.every(Number.isFinite) &&
      measured?.width === 512 && measured.height === 384 && measured.inputScale === 1 &&
      measured.bboxMode === 0 && measured.maxFaces === 1 && measured.landmarkFlags === 1 &&
      sameArray(measured.roi,[106,52,406,332]) && sameArray(measured.sdkInputSize,[300,280]) &&
      sameArray(measured.coordinateOffset,[100,10]);
    if (!valid) {
      return {svg:null,image:null,status:'candidate',title:'この条件の顔は準備中',
        description:'この条件に対応する、撮影枠と判定履歴まで確認できた画像はまだありません。',
        nativeImagePredictionVerified:false,mathVerified:false};
    }
    return {svg:null,image:result.imagePath,status:'candidate',
      title:'顔パターン ' + mapping.codeHex,
      description:'元の認識領域・撮影枠・複数観測の判定処理へ通した撮影候補です。',
      notes:['512×384画像の中央300×280を判定し、元の撮影枠と4観測以上の履歴を確認しています。',
             '画面を3DSで撮り直した結果は未確認です。照明・写す大きさ・角度で判定が変わります。'],
      featureValues:result.featureValues.slice(),inputSize:result.inputSize.slice(),
      nativeImagePredictionVerified:directlyVerified,nativeFaceDetectorVerified:directlyVerified,
      sharedCameraPredictionVerified:sharedVerified,
      geometryVerified:false,mathVerified:false,sdkAttributeControlled:false};
  }
  const api = Object.freeze({generate});
  if(typeof module !== 'undefined' && module.exports) module.exports = api;
  else scope.LensFaceGenerator = api;
})(typeof window === 'undefined' ? globalThis : window);
