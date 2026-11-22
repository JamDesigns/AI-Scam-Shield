// Maltese standard Flutter controls. API surface follows the installed Flutter SDK.
// CLDR date/number data and Maltese plural rules come from intl; no English delegate is used.
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/date_symbol_data_custom.dart' as custom_date_data;
import 'package:intl/date_symbol_data_local.dart' as local_date_data;
import 'package:intl/date_time_patterns.dart' as local_date_patterns;
import 'package:intl/intl.dart' as intl;

Future<void>? _malteseDateData;
Future<void> _ensureMalteseDateData() =>
    _malteseDateData ??= Future<void>.sync(() {
      // Flutter's global delegates may initialize intl with a map that does not
      // contain mt. initializeDateFormatting then leaves that existing map as-is.
      // Add just Maltese's real CLDR data, preserving every loaded locale, so
      // both mt -> global -> mt and global -> mt work with this cached future.
      final symbols = local_date_data.dateTimeSymbolMap()['mt'];
      final patterns = local_date_patterns.dateTimePatternMap()['mt'];
      if (symbols == null || patterns == null) {
        throw StateError('Maltese CLDR data is unavailable');
      }
      custom_date_data.initializeDateFormattingCustom(
        locale: 'mt',
        symbols: symbols,
        patterns: patterns,
      );
      if (!intl.DateFormat.localeExists('mt') ||
          !intl.NumberFormat.localeExists('mt')) {
        throw StateError('Maltese CLDR data is unavailable');
      }
    });

/// Place these before the Flutter global delegates when registering mt.
const malteseLocalizationsDelegates = <LocalizationsDelegate<dynamic>>[
  MalteseMaterialLocalizationsDelegate(),
  MalteseCupertinoLocalizationsDelegate(),
  MalteseWidgetsLocalizationsDelegate(),
];

class MalteseMaterialLocalizationsDelegate
    extends LocalizationsDelegate<MaterialLocalizations> {
  const MalteseMaterialLocalizationsDelegate();
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'mt';
  @override
  Future<MaterialLocalizations> load(Locale locale) async {
    await _ensureMalteseDateData();
    return MalteseMaterialLocalizations();
  }

  @override
  bool shouldReload(MalteseMaterialLocalizationsDelegate old) => false;
}

class MalteseCupertinoLocalizationsDelegate
    extends LocalizationsDelegate<CupertinoLocalizations> {
  const MalteseCupertinoLocalizationsDelegate();
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'mt';
  @override
  Future<CupertinoLocalizations> load(Locale locale) async {
    await _ensureMalteseDateData();
    return MalteseCupertinoLocalizations();
  }

  @override
  bool shouldReload(MalteseCupertinoLocalizationsDelegate old) => false;
}

class MalteseWidgetsLocalizationsDelegate
    extends LocalizationsDelegate<WidgetsLocalizations> {
  const MalteseWidgetsLocalizationsDelegate();
  @override
  bool isSupported(Locale locale) => locale.languageCode == 'mt';
  @override
  Future<WidgetsLocalizations> load(Locale locale) =>
      SynchronousFuture<WidgetsLocalizations>(
        const MalteseWidgetsLocalizations(),
      );
  @override
  bool shouldReload(MalteseWidgetsLocalizationsDelegate old) => false;
}

class MalteseMaterialLocalizations extends GlobalMaterialLocalizations {
  MalteseMaterialLocalizations()
      : super(
          localeName: 'mt',
          fullYearFormat: intl.DateFormat.y('mt'),
          compactDateFormat: intl.DateFormat.yMd('mt'),
          shortDateFormat: intl.DateFormat.yMMMd('mt'),
          mediumDateFormat: intl.DateFormat.MMMEd('mt'),
          longDateFormat: intl.DateFormat.yMMMMEEEEd('mt'),
          yearMonthFormat: intl.DateFormat.yMMMM('mt'),
          shortMonthDayFormat: intl.DateFormat.MMMd('mt'),
          decimalFormat: intl.NumberFormat.decimalPattern('mt'),
          twoDigitZeroPaddedFormat: intl.NumberFormat('00', 'mt'),
        );

  @override
  String get aboutListTileTitleRaw => r"Dwar $applicationName";

  @override
  String get alertDialogLabel => r"Twissija";

  @override
  String get anteMeridiemAbbreviation => r"AM";

  @override
  String get backButtonTooltip => r"Lura";

  @override
  String get bottomSheetLabel => r"Pannell t’isfel";

  @override
  String get calendarModeButtonLabel => r"Aqleb għall-kalendarju";

  @override
  String get cancelButtonLabel => r"Ikkanċella";

  @override
  String get clearButtonTooltip => r"Neħħi t-test";

  @override
  String get closeButtonLabel => r"Agħlaq";

  @override
  String get closeButtonTooltip => r"Agħlaq";

  @override
  String get collapsedHint => r"Imkabbar";

  @override
  String get collapsedIconTapHint => r"Kabbar";

  @override
  String get continueButtonLabel => r"Kompli";

  @override
  String get copyButtonLabel => r"Ikkopja";

  @override
  String get currentDateLabel => r"Illum";

  @override
  String get cutButtonLabel => r"Aqta’";

  @override
  String get dateHelpText => r"xahar/jum/sena";

  @override
  String get dateInputLabel => r"Daħħal data";

  @override
  String get dateOutOfRangeLabel => r"Barra mill-medda.";

  @override
  String get datePickerHelpText => r"Agħżel data";

  @override
  String get dateRangeEndDateSemanticLabelRaw => r"Data tat-tmiem $fullDate";

  @override
  String get dateRangeEndLabel => r"Data tat-tmiem";

  @override
  String get dateRangePickerHelpText => r"Agħżel medda";

  @override
  String get dateRangeStartDateSemanticLabelRaw => r"Data tal-bidu $fullDate";

  @override
  String get dateRangeStartLabel => r"Data tal-bidu";

  @override
  String get dateSeparator => r"/";

  @override
  String get deleteButtonTooltip => r"Ħassar";

  @override
  String get dialModeButtonLabel => r"Aqleb għall-arloġġ tal-għażla";

  @override
  String get dialogLabel => r"Djalogu";

  @override
  String get drawerLabel => r"Menu tan-navigazzjoni";

  @override
  String get expandedHint => r"Imċekken";

  @override
  String get expandedIconTapHint => r"Ċekken";

  @override
  String get expansionTileCollapsedHint => r"Tektek darbtejn biex tkabbar";

  @override
  String get expansionTileCollapsedTapHint => r"Kabbar għal aktar dettalji";

  @override
  String get expansionTileExpandedHint => r"Tektek darbtejn biex iċċekken";

  @override
  String get expansionTileExpandedTapHint => r"Ċekken";

  @override
  String get firstPageTooltip => r"L-ewwel paġna";

  @override
  String get hideAccountsLabel => r"Aħbi l-kontijiet";

  @override
  String get inputDateModeButtonLabel => r"Aqleb għad-dħul tat-test";

  @override
  String get inputTimeModeButtonLabel => r"Aqleb biex iddaħħal il-ħin bit-test";

  @override
  String get invalidDateFormatLabel => r"Format mhux validu.";

  @override
  String get invalidDateRangeLabel => r"Medda mhux valida.";

  @override
  String get invalidTimeLabel => r"Daħħal ħin validu";

  @override
  String get keyboardKeyAlt => r"Alt";

  @override
  String get keyboardKeyAltGraph => r"AltGr";

  @override
  String get keyboardKeyBackspace => r"Ħassar lura";

  @override
  String get keyboardKeyCapsLock => r"Sakkar l-ittri kapitali";

  @override
  String get keyboardKeyChannelDown => r"Kanal ’l isfel";

  @override
  String get keyboardKeyChannelUp => r"Kanal ’l fuq";

  @override
  String get keyboardKeyControl => r"Ctrl";

  @override
  String get keyboardKeyDelete => r"Ħassar";

  @override
  String get keyboardKeyEject => r"Oħroġ";

  @override
  String get keyboardKeyEnd => r"Tmiem";

  @override
  String get keyboardKeyEscape => r"Esc";

  @override
  String get keyboardKeyFn => r"Fn";

  @override
  String get keyboardKeyHome => r"Bidu";

  @override
  String get keyboardKeyInsert => r"Daħħal";

  @override
  String get keyboardKeyMeta => r"Meta";

  @override
  String get keyboardKeyMetaMacOs => r"Command";

  @override
  String get keyboardKeyMetaWindows => r"Win";

  @override
  String get keyboardKeyNumLock => r"Sakkar in-numri";

  @override
  String get keyboardKeyNumpad0 => r"Num 0";

  @override
  String get keyboardKeyNumpad1 => r"Num 1";

  @override
  String get keyboardKeyNumpad2 => r"Num 2";

  @override
  String get keyboardKeyNumpad3 => r"Num 3";

  @override
  String get keyboardKeyNumpad4 => r"Num 4";

  @override
  String get keyboardKeyNumpad5 => r"Num 5";

  @override
  String get keyboardKeyNumpad6 => r"Num 6";

  @override
  String get keyboardKeyNumpad7 => r"Num 7";

  @override
  String get keyboardKeyNumpad8 => r"Num 8";

  @override
  String get keyboardKeyNumpad9 => r"Num 9";

  @override
  String get keyboardKeyNumpadAdd => r"Num +";

  @override
  String get keyboardKeyNumpadComma => r"Num ,";

  @override
  String get keyboardKeyNumpadDecimal => r"Num .";

  @override
  String get keyboardKeyNumpadDivide => r"Num /";

  @override
  String get keyboardKeyNumpadEnter => r"Num Daħħal";

  @override
  String get keyboardKeyNumpadEqual => r"Num =";

  @override
  String get keyboardKeyNumpadMultiply => r"Num *";

  @override
  String get keyboardKeyNumpadParenLeft => r"Num (";

  @override
  String get keyboardKeyNumpadParenRight => r"Num )";

  @override
  String get keyboardKeyNumpadSubtract => r"Num -";

  @override
  String get keyboardKeyPageDown => r"Paġna ’l isfel";

  @override
  String get keyboardKeyPageUp => r"Paġna ’l fuq";

  @override
  String get keyboardKeyPower => r"Enerġija";

  @override
  String get keyboardKeyPowerOff => r"Itfi";

  @override
  String get keyboardKeyPrintScreen => r"Qbid tal-iskrin";

  @override
  String get keyboardKeyScrollLock => r"Sakkar l-iskrolljar";

  @override
  String get keyboardKeySelect => r"Agħżel";

  @override
  String get keyboardKeyShift => r"Shift";

  @override
  String get keyboardKeySpace => r"Spazju";

  @override
  String get lastPageTooltip => r"L-aħħar paġna";

  @override
  String? get licensesPackageDetailTextFew => r"$licenseCount liċenzji";

  @override
  String? get licensesPackageDetailTextMany => r"$licenseCount-il liċenzja";

  @override
  String? get licensesPackageDetailTextOne => r"Liċenzja waħda";

  @override
  String get licensesPackageDetailTextOther => r"$licenseCount liċenzja";

  @override
  String? get licensesPackageDetailTextTwo => r"Żewġ liċenzji";

  @override
  String? get licensesPackageDetailTextZero => r"Ebda liċenzja";

  @override
  String get licensesPageTitle => r"Liċenzji";

  @override
  String get lookUpButtonLabel => r"Fittex it-tifsira";

  @override
  String get menuBarMenuLabel => r"Menu tal-istrixxa tal-menus";

  @override
  String get menuDismissLabel => r"Agħlaq il-menu";

  @override
  String get modalBarrierDismissLabel => r"Agħlaq";

  @override
  String get moreButtonTooltip => r"Aktar";

  @override
  String get nextMonthTooltip => r"Ix-xahar li jmiss";

  @override
  String get nextPageTooltip => r"Il-paġna li jmiss";

  @override
  String get okButtonLabel => r"Tajjeb";

  @override
  String get openAppDrawerTooltip => r"Iftaħ il-menu tan-navigazzjoni";

  @override
  String get pageRowsInfoTitleRaw => r"$firstRow–$lastRow minn $rowCount";

  @override
  String get pageRowsInfoTitleApproximateRaw =>
      r"$firstRow–$lastRow minn madwar $rowCount";

  @override
  String get pasteButtonLabel => r"Waħħal";

  @override
  String get popupMenuLabel => r"Menu li jitfaċċa";

  @override
  String get postMeridiemAbbreviation => r"PM";

  @override
  String get previousMonthTooltip => r"Ix-xahar ta’ qabel";

  @override
  String get previousPageTooltip => r"Il-paġna ta’ qabel";

  @override
  String get refreshIndicatorSemanticLabel => r"Aġġorna";

  @override
  String? get remainingTextFieldCharacterCountFew =>
      r"Fadal $remainingCount karattri";

  @override
  String? get remainingTextFieldCharacterCountMany =>
      r"Fadal $remainingCount-il karattru";

  @override
  String? get remainingTextFieldCharacterCountOne => r"Fadal karattru wieħed";

  @override
  String get remainingTextFieldCharacterCountOther =>
      r"Fadal $remainingCount karattru";

  @override
  String? get remainingTextFieldCharacterCountTwo => r"Fadal żewġ karattri";

  @override
  String? get remainingTextFieldCharacterCountZero => r"Ma fadalx karattri";

  @override
  String get reorderItemDown => r"Mexxi ’l isfel";

  @override
  String get reorderItemLeft => r"Mexxi lejn ix-xellug";

  @override
  String get reorderItemRight => r"Mexxi lejn il-lemin";

  @override
  String get reorderItemToEnd => r"Mexxi fl-aħħar";

  @override
  String get reorderItemToStart => r"Mexxi fil-bidu";

  @override
  String get reorderItemUp => r"Mexxi ’l fuq";

  @override
  String get rowsPerPageTitle => r"Ringieli għal kull paġna:";

  @override
  String get saveButtonLabel => r"Issejvja";

  @override
  String get scanTextButtonLabel => r"Aqra t-test mill-immaġni";

  @override
  String get scrimLabel => r"Saff ta’ sfond";

  @override
  String get scrimOnTapHintRaw => r"Agħlaq $modalRouteContentName";

  @override
  ScriptCategory get scriptCategory => ScriptCategory.englishLike;

  @override
  String get searchFieldLabel => r"Fittex";

  @override
  String get searchWebButtonLabel => r"Fittex fuq il-web";

  @override
  String get selectAllButtonLabel => r"Agħżel kollox";

  @override
  String get selectYearSemanticsLabel => r"Agħżel sena";

  @override
  String get selectedDateLabel => r"Magħżula";

  @override
  String? get selectedRowCountTitleFew => r"$selectedRowCount oġġetti magħżula";

  @override
  String? get selectedRowCountTitleMany =>
      r"$selectedRowCount-il oġġett magħżul";

  @override
  String? get selectedRowCountTitleOne => r"Oġġett wieħed magħżul";

  @override
  String get selectedRowCountTitleOther => r"$selectedRowCount oġġett magħżul";

  @override
  String? get selectedRowCountTitleTwo => r"Żewġ oġġetti magħżula";

  @override
  String? get selectedRowCountTitleZero => r"Ebda oġġett magħżul";

  @override
  String get shareButtonLabel => r"Aqsam";

  @override
  String get showAccountsLabel => r"Uri l-kontijiet";

  @override
  String get showMenuTooltip => r"Uri l-menu";

  @override
  String get signedInLabel => r"Dħalt fil-kont";

  @override
  String get tabLabelRaw => r"Tab $tabIndex minn $tabCount";

  @override
  TimeOfDayFormat get timeOfDayFormatRaw => TimeOfDayFormat.HH_colon_mm;

  @override
  String get timePickerDialHelpText => r"Agħżel ħin";

  @override
  String get timePickerHourLabel => r"Siegħa";

  @override
  String get timePickerHourModeAnnouncement => r"Agħżel is-sigħat";

  @override
  String get timePickerInputHelpText => r"Daħħal ħin";

  @override
  String get timePickerMinuteLabel => r"Minuta";

  @override
  String get timePickerMinuteModeAnnouncement => r"Agħżel il-minuti";

  @override
  String get unspecifiedDate => r"Data";

  @override
  String get unspecifiedDateRange => r"Medda ta’ dati";

  @override
  String get viewLicensesButtonLabel => r"Ara l-liċenzji";
}

class MalteseCupertinoLocalizations extends GlobalCupertinoLocalizations {
  MalteseCupertinoLocalizations()
      : super(
          localeName: 'mt',
          fullYearFormat: intl.DateFormat.y('mt'),
          dayFormat: intl.DateFormat.d('mt'),
          weekdayFormat: intl.DateFormat.E('mt'),
          mediumDateFormat: intl.DateFormat.MMMEd('mt'),
          singleDigitHourFormat: intl.DateFormat.H('mt'),
          singleDigitMinuteFormat: intl.DateFormat.m('mt'),
          doubleDigitMinuteFormat: intl.DateFormat('mm', 'mt'),
          singleDigitSecondFormat: intl.DateFormat.s('mt'),
          decimalFormat: intl.NumberFormat.decimalPattern('mt'),
        );

  @override
  String get alertDialogLabel => r"Twissija";

  @override
  String get anteMeridiemAbbreviation => r"AM";

  @override
  String get backButtonLabel => r"Lura";

  @override
  String get cancelButtonLabel => r"Ikkanċella";

  @override
  String get clearButtonLabel => r"Neħħi";

  @override
  String get collapsedHint => r"Imkabbar";

  @override
  String get copyButtonLabel => r"Ikkopja";

  @override
  String get cutButtonLabel => r"Aqta’";

  @override
  String get datePickerDateOrderString => r"mdy";

  @override
  String get datePickerDateTimeOrderString => r"date_time_dayPeriod";

  @override
  String? get datePickerHourSemanticsLabelFew => r"Is-siegħa $hour";

  @override
  String? get datePickerHourSemanticsLabelMany => r"Is-siegħa $hour";

  @override
  String? get datePickerHourSemanticsLabelOne => r"Is-siegħa $hour";

  @override
  String get datePickerHourSemanticsLabelOther => r"Is-siegħa $hour";

  @override
  String? get datePickerHourSemanticsLabelTwo => r"Is-siegħa $hour";

  @override
  String? get datePickerHourSemanticsLabelZero => r"Is-siegħa $hour";

  @override
  String? get datePickerMinuteSemanticsLabelFew => r"$minute minuti";

  @override
  String? get datePickerMinuteSemanticsLabelMany => r"$minute-il minuta";

  @override
  String? get datePickerMinuteSemanticsLabelOne => r"Minuta waħda";

  @override
  String get datePickerMinuteSemanticsLabelOther => r"$minute minuta";

  @override
  String? get datePickerMinuteSemanticsLabelTwo => r"Żewġ minuti";

  @override
  String? get datePickerMinuteSemanticsLabelZero => r"Żero minuti";

  @override
  String get expandedHint => r"Imċekken";

  @override
  String get expansionTileCollapsedHint => r"Tektek darbtejn biex tkabbar";

  @override
  String get expansionTileCollapsedTapHint => r"Kabbar għal aktar dettalji";

  @override
  String get expansionTileExpandedHint => r"Tektek darbtejn biex iċċekken";

  @override
  String get expansionTileExpandedTapHint => r"Ċekken";

  @override
  String get lookUpButtonLabel => r"Fittex it-tifsira";

  @override
  String get menuDismissLabel => r"Agħlaq il-menu";

  @override
  String get modalBarrierDismissLabel => r"Agħlaq";

  @override
  String get noSpellCheckReplacementsLabel => r"Ma nstabux sostituzzjonijiet";

  @override
  String get pasteButtonLabel => r"Waħħal";

  @override
  String get postMeridiemAbbreviation => r"PM";

  @override
  String get searchTextFieldPlaceholderLabel => r"Fittex";

  @override
  String get searchWebButtonLabel => r"Fittex fuq il-web";

  @override
  String get selectAllButtonLabel => r"Agħżel kollox";

  @override
  String get shareButtonLabel => r"Aqsam";

  @override
  String get tabSemanticsLabelRaw => r"Tab $tabIndex minn $tabCount";

  @override
  String? get timerPickerHourLabelFew => r"sigħat";

  @override
  String? get timerPickerHourLabelMany => r"siegħa";

  @override
  String? get timerPickerHourLabelOne => r"siegħa";

  @override
  String get timerPickerHourLabelOther => r"siegħa";

  @override
  String? get timerPickerHourLabelTwo => r"sigħat";

  @override
  String? get timerPickerHourLabelZero => r"sigħat";

  @override
  String? get timerPickerMinuteLabelFew => r"minuti";

  @override
  String? get timerPickerMinuteLabelMany => r"minuta";

  @override
  String? get timerPickerMinuteLabelOne => r"minuta";

  @override
  String get timerPickerMinuteLabelOther => r"minuta";

  @override
  String? get timerPickerMinuteLabelTwo => r"minuti";

  @override
  String? get timerPickerMinuteLabelZero => r"minuti";

  @override
  String? get timerPickerSecondLabelFew => r"sekondi";

  @override
  String? get timerPickerSecondLabelMany => r"sekonda";

  @override
  String? get timerPickerSecondLabelOne => r"sekonda";

  @override
  String get timerPickerSecondLabelOther => r"sekonda";

  @override
  String? get timerPickerSecondLabelTwo => r"sekondi";

  @override
  String? get timerPickerSecondLabelZero => r"sekondi";

  @override
  String get todayLabel => r"Illum";
}

class MalteseWidgetsLocalizations extends GlobalWidgetsLocalizations {
  const MalteseWidgetsLocalizations() : super(TextDirection.ltr);

  @override
  String get copyButtonLabel => r"Ikkopja";

  @override
  String get cutButtonLabel => r"Aqta’";

  @override
  String get lookUpButtonLabel => r"Fittex it-tifsira";

  @override
  String get noResultsFound => r"Ma nstabux riżultati";

  @override
  String get pasteButtonLabel => r"Waħħal";

  @override
  String get radioButtonUnselectedLabel => r"Mhux magħżul";

  @override
  String get reorderItemDown => r"Mexxi ’l isfel";

  @override
  String get reorderItemLeft => r"Mexxi lejn ix-xellug";

  @override
  String get reorderItemRight => r"Mexxi lejn il-lemin";

  @override
  String get reorderItemToEnd => r"Mexxi fl-aħħar";

  @override
  String get reorderItemToStart => r"Mexxi fil-bidu";

  @override
  String get reorderItemUp => r"Mexxi ’l fuq";

  @override
  String get searchResultsFound => r"Instabu riżultati tat-tfittxija";

  @override
  String get searchWebButtonLabel => r"Fittex fuq il-web";

  @override
  String get selectAllButtonLabel => r"Agħżel kollox";

  @override
  String get shareButtonLabel => r"Aqsam";
}
