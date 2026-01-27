/**
 * Expo Config Plugin for Daydate Widget
 *
 * This plugin configures the iOS widget extension for the Daydate app.
 * It adds the widget target to the Xcode project and configures App Groups.
 */

const {
  withXcodeProject,
  withEntitlementsPlist,
  withInfoPlist,
} = require('@expo/config-plugins');
const path = require('path');
const fs = require('fs');

// Widget configuration
const WIDGET_NAME = 'DaydateWidget';
const WIDGET_BUNDLE_ID = 'com.daydate.app.widget';
const APP_GROUP_ID = 'group.com.daydate.app';

/**
 * Add App Groups entitlement to main app
 */
function withAppGroupsEntitlement(config) {
  return withEntitlementsPlist(config, (modConfig) => {
    modConfig.modResults['com.apple.security.application-groups'] = [APP_GROUP_ID];
    return modConfig;
  });
}

/**
 * Add widget extension target to Xcode project
 */
function withWidgetExtension(config) {
  return withXcodeProject(config, async (modConfig) => {
    const xcodeProject = modConfig.modResults;
    const projectRoot = modConfig.modRequest.projectRoot;
    const widgetPath = path.join(projectRoot, 'ios', WIDGET_NAME);

    // Check if widget files exist
    if (!fs.existsSync(widgetPath)) {
      console.warn(`[withDaydateWidget] Widget folder not found at ${widgetPath}`);
      return modConfig;
    }

    // Get the main app target
    const mainTarget = xcodeProject.getFirstTarget();
    if (!mainTarget) {
      console.warn('[withDaydateWidget] Could not find main app target');
      return modConfig;
    }

    // Check if widget target already exists
    const existingTarget = xcodeProject.pbxTargetByName(WIDGET_NAME);
    if (existingTarget) {
      console.log('[withDaydateWidget] Widget target already exists');
      return modConfig;
    }

    // Add widget extension target
    const widgetTarget = xcodeProject.addTarget(
      WIDGET_NAME,
      'app_extension',
      WIDGET_NAME,
      WIDGET_BUNDLE_ID
    );

    if (!widgetTarget) {
      console.warn('[withDaydateWidget] Failed to add widget target');
      return modConfig;
    }

    // Add widget source files to the target
    const widgetFiles = [
      'DaydateWidget.swift',
      'DaydateWidgetBundle.swift',
    ];

    const widgetGroup = xcodeProject.addPbxGroup(
      widgetFiles,
      WIDGET_NAME,
      WIDGET_NAME
    );

    // Add widget to main group
    const mainGroup = xcodeProject.getFirstProject().firstProject.mainGroup;
    xcodeProject.addToPbxGroup(widgetGroup.uuid, mainGroup);

    // Add files to build phase
    widgetFiles.forEach((file) => {
      const filePath = path.join(WIDGET_NAME, file);
      xcodeProject.addSourceFile(filePath, null, widgetTarget.uuid);
    });

    // Add Assets.xcassets
    xcodeProject.addResourceFile(
      path.join(WIDGET_NAME, 'Assets.xcassets'),
      null,
      widgetTarget.uuid
    );

    // Set build settings for widget
    const buildSettings = {
      ASSETCATALOG_COMPILER_WIDGET_BACKGROUND_COLOR_NAME: 'WidgetBackground',
      CODE_SIGN_ENTITLEMENTS: `${WIDGET_NAME}/${WIDGET_NAME}.entitlements`,
      CODE_SIGN_STYLE: 'Automatic',
      CURRENT_PROJECT_VERSION: '1',
      GENERATE_INFOPLIST_FILE: 'YES',
      INFOPLIST_FILE: `${WIDGET_NAME}/Info.plist`,
      INFOPLIST_KEY_CFBundleDisplayName: 'Daydate Widget',
      INFOPLIST_KEY_NSHumanReadableCopyright: '',
      LD_RUNPATH_SEARCH_PATHS: [
        '$(inherited)',
        '@executable_path/Frameworks',
        '@executable_path/../../Frameworks',
      ],
      MARKETING_VERSION: '1.0',
      PRODUCT_BUNDLE_IDENTIFIER: WIDGET_BUNDLE_ID,
      PRODUCT_NAME: '$(TARGET_NAME)',
      SKIP_INSTALL: 'YES',
      SWIFT_EMIT_LOC_STRINGS: 'YES',
      SWIFT_VERSION: '5.0',
      TARGETED_DEVICE_FAMILY: '1,2',
    };

    // Apply build settings to both Debug and Release
    const configurations = xcodeProject.pbxXCBuildConfigurationSection();
    Object.keys(configurations).forEach((key) => {
      const config = configurations[key];
      if (config.buildSettings && config.name) {
        // Find widget target configurations
        const targetName = config.buildSettings.PRODUCT_NAME;
        if (targetName === '$(TARGET_NAME)' || targetName === WIDGET_NAME) {
          Object.assign(config.buildSettings, buildSettings);
        }
      }
    });

    // Add widget to "Embed App Extensions" build phase
    xcodeProject.addBuildPhase(
      [],
      'PBXCopyFilesBuildPhase',
      'Embed App Extensions',
      mainTarget.uuid,
      'app_extension'
    );

    console.log('[withDaydateWidget] Widget extension configured successfully');
    return modConfig;
  });
}

/**
 * Main plugin function
 */
function withDaydateWidget(config) {
  // Add App Groups entitlement
  config = withAppGroupsEntitlement(config);

  // Add widget extension
  config = withWidgetExtension(config);

  return config;
}

module.exports = withDaydateWidget;
