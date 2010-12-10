/** Chrome Background Page **/

/** Alias for the OnSIP_Preferences object **/
var pref         = OnSIP_Preferences; 
var highrise_app = HIGHRISE;
var zendesk_app  = ZENDESK;
var extension    = null;
var rebound_to   = 2; /** minutes **/
var state_log    = [];
var BG_LOG       = "CHROME-BACKGROUND";

/** Connect, subscribe, and register to XMPP API **/
OX_EXT.apps = [BG_APP];

if (pref && pref.get('onsipCredentialsGood') === true && pref.get ('onsipPassword') && pref.get ('fromAddress')) {
    if (pref.get ('onsipPassword').length > 0 && pref.get ('fromAddress').length > 0) {
        OX_EXT.init   (pref, {
            onSuccess : function () {
		dbg.log (BG_LOG, 'Succeeded in OX_EXT.init for connecting & subscribing');
            },
            onError   : function (error) {	    
                /** In case of failure, display settings in a new tab **/
		dbg.log (BG_LOG, 'There was an error in OX_EXT.init ' + error);
            }
	});
    } else {
	dbg.log (BG_LOG, 'OX_EXT.init NOT called, no credentials found');
    }
};

/** An extension to this background page with helper methods **/
extension = new OnSIP_Process();
extension.init ();

/** Load and initialize Highrise with contacts **/
dbg.log (BG_LOG, 'Highrise Enabled --> ' + pref.get ('highriseEnabled'));
if (pref && pref.get ('highriseEnabled') === true) {
    highrise_app.init(pref);
}

/** Initialize Zendesk with Contacts **/
dbg.log (BG_LOG, 'Zendesk Enabled --> '  + pref.get ('zendeskEnabled'));
if (pref && pref.get ('zendeskEnabled') === true) {
    zendesk_app.init (pref);
}

/** Add event listener for clicks on the extension icon **/
chrome.browserAction.onClicked.addListener ( function (TAB) {
    dbg.log (BG_LOG, 'clicked enable / disable icon');
    extension.toggle ();
});

/** Stores a state every time an "active" event is sent, up to 20 items. **/
chrome.idle.onStateChanged.addListener     ( function (newstate) {
    /** Rebound BOSH logic **/
    if (state_log.length >= 1) {
	var d_past = state_log[0].time;
	var d_now  = new Date();
	var diff   = d_now.getTime() - d_past.getTime();

	/** These are the minutes in idle **/
	var min    = Math.floor (diff/1000/60);	
	dbg.log (BG_LOG, 'Minutes since idle ' + min + ' state log length is (' + state_log.length + ')');
	while (state_log.length > 0) {
	    state_log.pop();
	}
	if (min >= rebound_to && pref && pref.get ('onsipCredentialsGood')) {
	    dbg.log (BG_LOG, 'IDLE for ' + min + ' minutes lets RE-ESTABLISH connection');	    
	    var do_exec = function () {	        
		OX_EXT.failures     = 0;	
		BG_APP.launched_n   = false;		    
		OX_EXT.init   (pref, {
		    onSuccess : function () {
			dbg.log (BG_LOG, 'Succeeded in OX_EXT.init for REBOUND connecting & subscribing');
		    },
		    onError   : function (error) {
			dbg.log (BG_LOG, 'There was an error in REBOUND OX_EXT INIT ' + error);
	            }
	        });
	        		
		/** Load and initialize Highrise with contacts **/
		if (pref && pref.get ('highriseEnabled') === true) {
		    highrise_app.init(pref);
		}

		/** Initialize Zendesk with Contacts **/		
		if (pref && pref.get ('zendeskEnabled')  === true) {
		    zendesk_app.init (pref);
		}
	    };
	    
	    OX_EXT.iConnectCheck  (pref, {
	        onSuccess : function () {		    
		    dbg.log (BG_LOG, 'Successfully connected to BOSH Server, do_exec()');
		    do_exec ();	
		},
                onError   : function () {
		    dbg.log (BG_LOG, 'Failed to connect to BOSH pop off active node ');
		    state_log.shift();
		}
	    });	    
	}
    }
});

var sc = function () {
    chrome.idle.queryState(15, function (newstate) {
	/** dbg.log (BG_LOG, 'State Check -> ' + newstate); **/
	if (newstate === 'idle') {
	    if (state_log.length === 0) {
		var time = new Date();
		state_log.unshift({'state':newstate, 'time':time});
		dbg.log (BG_LOG, 'Logged a new idle state @ ' + time);
	    }	    	    
	}
    });
    setTimeout (sc, 60000);
};
sc();

/** Add listener for requests from the pages **/          
chrome.extension.onRequest.addListener    ( function (request, sender, sendResponse) {    
    dbg.log (BG_LOG, 'Request ');

    /** On load parse request **/     
    if ( request.pageLoad && pref.get('enabled') ) {
	dbg.log (BG_LOG, 'Send response to TAB');
        sendResponse ({ parseDOM : true, fromAddress : pref.get('fromAddress')});
    }

    /** Open settings page request **/
    if ( request.openSettingsPage ) {
        chrome.tabs.create ({ "url" : "index.html" });
    }

    /** Make a Call on request **/
    if ( request.setupCall && pref.get ('enabled') ) {
	var from_address = pref.get('fromAddress');	
        var to_address   = request.phone_no; 	
	// var clean_no     = formatPhoneNum (to_address);
	dbg.log (BG_LOG, 'Call requested FROM: ' + 
		 from_address + ' - TO: ' + to_address);
	OX_EXT.createCall (from_address, to_address, to_address);
    }
    
    /** Verify SIP User **/
    if ( request.verifyOnSipUser ) {
	dbg.log (BG_LOG, 'Request verify on sip user  ' + 
		 request.username + ', ***  -- ' + 
		 pref.get ('onsipHttpBase'));

	pref.set ('fromAddress'  , request.username);
	pref.set ('onsipPassword', request.password);

	OX_EXT.init (pref, {
	    onSuccess : function () {
		dbg.log (BG_LOG, "SIP user Verified Successfully");
		sendResponse ({ ok : true  });	    
	    },
	    onError   : function (error) {
		dbg.log (BG_LOG, "Error in verifying SIP User [ " + error + " ]");
		sendResponse ({ ok : false });
	    }
	});
    }

    /** Verify Zendesk User **/
    if ( request.verifyZendesk ) {
       dbg.log (BG_LOG, 'Verifying Zendesk account with ' + 
		    request.zendesk_url + ' - ' + request.zendesk_usr + ' - ' + request.zendesk_pwd);
       zendesk_app.verify ({
          onSuccess : function () {
	     sendResponse ({ok : true});
	     zendesk_app.init (pref);
             dbg.log (BG_LOG, 'Zendesk Credentials OK');
	  },
          onError   : function () { 
	     sendResponse ({ok : false});
	     dbg.log (BG_LOG, 'Zendesk Credetials INVALID ');	    
          }
       }, request.zendesk_url, request.zendesk_usr, request.zendesk_pwd);
    }

    /** Verify Highrise Account **/
    if ( request.verifyHighrise ) {
	var highriseResult = {};
	dbg.log(BG_LOG, 'Verifying Highrise Credentials TOKEN ' + request.highrise_url + '');    
        highrise_app.verifyToken ({
	    onSuccess : function (data) {
		dbg.log(BG_LOG, 'HIGHRISE API :: Highrise credentials OK');
	        sendResponse ({ ok : true });		
		highrise_app.init (pref);		  
	    },
	    onError   : function () {
		dbg.log(BG_LOG, 'HIGHRISE API :: Highrise credentials NOT OK');
		sendResponse ({ ok : false });
	    }},
	    request.highrise_url,
            request.highrise_token);	
    } 

});

