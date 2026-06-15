/**
 * Config plugin Expo — corrige l'échec EAS Build lié à JitPack.
 *
 * Problème : sur Android, `expo-image-picker` (SDK 52 → v16.x) dépend de
 *   com.github.CanHub:Android-Image-Cropper  (hébergé sur JitPack)
 * et JitPack renvoie régulièrement 403 Forbidden → le build Gradle échoue.
 *
 * Solution : on substitue cette dépendance par son équivalent publié sur
 * Maven Central, `com.vanniktech:android-image-cropper`, qui expose EXACTEMENT
 * le même package Java/Kotlin `com.canhub.cropper.*` (CropImage, CropImageView…).
 * → plus aucune dépendance à JitPack, compatible avec toutes les versions
 *   d'expo-image-picker. Si CanHub n'est pas présent, la substitution est un
 *   no-op inoffensif.
 */
const { withProjectBuildGradle } = require('@expo/config-plugins');

const MARKER = '// >>> sb-drive: image-cropper JitPack fix';

const BLOCK = `
${MARKER}
allprojects {
    configurations.all {
        resolutionStrategy.dependencySubstitution {
            substitute module('com.github.CanHub:Android-Image-Cropper') using module('com.vanniktech:android-image-cropper:4.7.0')
        }
    }
}
// <<< sb-drive: image-cropper JitPack fix
`;

module.exports = function withImageCropperFix(config) {
  return withProjectBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') {
      return cfg; // build.gradle attendu en Groovy
    }
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents = cfg.modResults.contents + '\n' + BLOCK;
    }
    return cfg;
  });
};
