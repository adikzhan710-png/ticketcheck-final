// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @title TicketCheck
/// @notice Educational prototype for issuing, transferring, and redeeming event tickets.
/// @dev Wallet control proves control of an address, not a person's real-world identity.
contract TicketCheck {
    uint256 public constant MAX_ENTRY_AUTHORIZATION_DURATION = 10 minutes;

    enum TicketStatus {
        Active,
        Used,
        Revoked
    }

    struct EventData {
        address organizer;
        bool exists;
    }

    struct Ticket {
        uint256 eventId;
        address owner;
        TicketStatus status;
        bool exists;
    }

    struct EntryAuthorization {
        address owner;
        address gate;
        uint256 validUntil;
        uint256 gateEpoch;
    }

    mapping(uint256 => EventData) public events;
    mapping(uint256 => mapping(address => bool)) public gateStaff;
    mapping(uint256 => mapping(address => uint256)) public gateEpoch;
    mapping(uint256 => Ticket) public tickets;
    mapping(uint256 => EntryAuthorization) public entryAuthorizations;

    event EventCreated(uint256 indexed eventId, address indexed organizer);
    event GateStaffUpdated(
        uint256 indexed eventId,
        address indexed gate,
        bool authorized
    );
    event TicketIssued(
        uint256 indexed ticketId,
        uint256 indexed eventId,
        address indexed owner
    );
    event TicketTransferred(
        uint256 indexed ticketId,
        address indexed previousOwner,
        address indexed newOwner
    );
    event EntryAuthorized(
        uint256 indexed ticketId,
        address indexed owner,
        address indexed gate,
        uint256 validUntil
    );
    event EntryAuthorizationCancelled(uint256 indexed ticketId);
    event TicketRedeemed(
        uint256 indexed ticketId,
        address indexed owner,
        address indexed gate
    );
    event TicketRevoked(uint256 indexed ticketId, uint256 indexed eventId);

    modifier eventExists(uint256 eventId) {
        require(events[eventId].exists, "Event does not exist");
        _;
    }

    modifier onlyEventOrganizer(uint256 eventId) {
        require(
            events[eventId].organizer == msg.sender,
            "Caller is not event organizer"
        );
        _;
    }

    modifier ticketExists(uint256 ticketId) {
        require(tickets[ticketId].exists, "Ticket does not exist");
        _;
    }

    function createEvent(uint256 eventId) external {
        require(!events[eventId].exists, "Event already exists");

        events[eventId] = EventData({organizer: msg.sender, exists: true});

        emit EventCreated(eventId, msg.sender);
    }

    function setGateStaff(
        uint256 eventId,
        address gate,
        bool authorized
    )
        external
        eventExists(eventId)
        onlyEventOrganizer(eventId)
    {
        require(gate != address(0), "Gate address is zero");

        gateEpoch[eventId][gate] += 1;
        gateStaff[eventId][gate] = authorized;

        emit GateStaffUpdated(eventId, gate, authorized);
    }

    function issueTicket(
        uint256 eventId,
        uint256 ticketId,
        address owner
    )
        external
        eventExists(eventId)
        onlyEventOrganizer(eventId)
    {
        require(!tickets[ticketId].exists, "Ticket already exists");
        require(owner != address(0), "Owner address is zero");

        tickets[ticketId] = Ticket({
            eventId: eventId,
            owner: owner,
            status: TicketStatus.Active,
            exists: true
        });

        emit TicketIssued(ticketId, eventId, owner);
    }

    function transferTicket(
        uint256 ticketId,
        address newOwner
    ) external ticketExists(ticketId) {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.status == TicketStatus.Active, "Ticket is not active");
        require(ticket.owner == msg.sender, "Caller is not ticket owner");
        require(newOwner != address(0), "New owner address is zero");
        require(newOwner != msg.sender, "Cannot transfer to current owner");

        address previousOwner = ticket.owner;
        ticket.owner = newOwner;
        _clearEntryAuthorization(ticketId);

        emit TicketTransferred(ticketId, previousOwner, newOwner);
    }

    /// @notice Grants one authorized gate a short-lived right to redeem this ticket.
    /// @dev Authorization does not prove that the wallet holder is physically present.
    function authorizeEntry(
        uint256 ticketId,
        address gate,
        uint256 validUntil
    ) external ticketExists(ticketId) {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.status == TicketStatus.Active, "Ticket is not active");
        require(ticket.owner == msg.sender, "Caller is not ticket owner");
        require(gate != address(0), "Gate address is zero");
        require(
            gateStaff[ticket.eventId][gate],
            "Gate is not authorized for event"
        );
        require(validUntil > block.timestamp, "Authorization already expired");
        require(
            validUntil <= block.timestamp + MAX_ENTRY_AUTHORIZATION_DURATION,
            "Authorization exceeds 10 minutes"
        );

        entryAuthorizations[ticketId] = EntryAuthorization({
            owner: msg.sender,
            gate: gate,
            validUntil: validUntil,
            gateEpoch: gateEpoch[ticket.eventId][gate]
        });

        emit EntryAuthorized(ticketId, msg.sender, gate, validUntil);
    }

    function cancelEntryAuthorization(
        uint256 ticketId
    ) external ticketExists(ticketId) {
        require(
            tickets[ticketId].owner == msg.sender,
            "Caller is not ticket owner"
        );

        _clearEntryAuthorization(ticketId);
        emit EntryAuthorizationCancelled(ticketId);
    }

    function redeemTicket(
        uint256 ticketId
    ) external ticketExists(ticketId) {
        Ticket storage ticket = tickets[ticketId];
        require(ticket.status == TicketStatus.Active, "Ticket is not active");
        require(
            gateStaff[ticket.eventId][msg.sender],
            "Caller is not authorized gate staff"
        );

        EntryAuthorization memory authorization = entryAuthorizations[ticketId];
        require(authorization.owner == ticket.owner, "Owner did not authorize entry");
        require(authorization.gate == msg.sender, "Entry authorized for another gate");
        require(
            authorization.gateEpoch == gateEpoch[ticket.eventId][msg.sender],
            "Gate authorization changed"
        );
        require(
            authorization.validUntil >= block.timestamp,
            "Entry authorization expired"
        );

        address owner = ticket.owner;
        ticket.status = TicketStatus.Used;
        _clearEntryAuthorization(ticketId);

        emit TicketRedeemed(ticketId, owner, msg.sender);
    }

    function revokeTicket(
        uint256 ticketId
    ) external ticketExists(ticketId) {
        Ticket storage ticket = tickets[ticketId];
        require(
            events[ticket.eventId].organizer == msg.sender,
            "Caller is not event organizer"
        );
        require(ticket.status == TicketStatus.Active, "Ticket is not active");

        ticket.status = TicketStatus.Revoked;
        _clearEntryAuthorization(ticketId);

        emit TicketRevoked(ticketId, ticket.eventId);
    }

    function _clearEntryAuthorization(uint256 ticketId) private {
        delete entryAuthorizations[ticketId];
    }
}
